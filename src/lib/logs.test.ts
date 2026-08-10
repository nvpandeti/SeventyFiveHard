import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFirstListItem = vi.fn();
const update = vi.fn();
const create = vi.fn();
const getList = vi.fn();

vi.mock('./pocketbase', () => ({
  pb: {
    authStore: { record: { id: 'user_1' } },
    collection: vi.fn((name: string) => {
      if (name !== 'daily_logs') {
        throw new Error(`Unexpected collection ${name}`);
      }
      return {
        getFirstListItem,
        update,
        create,
        getList,
      };
    }),
    files: {
      getURL: vi.fn(),
    },
  },
}));

describe('upsertMyLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // No record found in direct lookup; this triggers create path first.
    getFirstListItem.mockRejectedValue({ status: 404 });

    // No existing row in fallback by default.
    getList.mockResolvedValue({ items: [] });
  });

  it('recovers from duplicate create conflict using fallback update', async () => {
    const payload = {
      diet_ok: true,
      workout_1: true,
      workout_2: true,
      water_ok: true,
      reading_ok: true,
      completed: true,
    };

    create.mockRejectedValue({
      status: 400,
      response: {
        message: 'validation failed',
        data: {
          user: { code: 'validation_not_unique', message: 'Already exists.' },
        },
      },
    });

    // First fallback (inside getMyLogForDate) should find nothing.
    getList.mockResolvedValueOnce({ items: [] });

    // Second fallback (after create conflict) should find the conflicting row.
    getList.mockResolvedValueOnce({
      items: [
        {
          id: 'existing_log_id',
          user: 'user_1',
          date: '2026-08-09 00:00:00.000Z',
          ...payload,
        },
      ],
    });

    update.mockResolvedValue({
      id: 'existing_log_id',
      user: 'user_1',
      date: '2026-08-09',
      ...payload,
      progress_photo: 'photo.jpg',
    });

    const { upsertMyLog } = await import('./logs');

    const result = await upsertMyLog('2026-08-09', payload);

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      'existing_log_id',
      expect.objectContaining({
        completed: true,
        diet_ok: true,
      }),
    );
    // user and date must NOT be in the update body to avoid unique-constraint conflict
    expect(update.mock.calls[0][1]).not.toHaveProperty('user');
    expect(update.mock.calls[0][1]).not.toHaveProperty('date');
    expect(result.id).toBe('existing_log_id');
  });
});
