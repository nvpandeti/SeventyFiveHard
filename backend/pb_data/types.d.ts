declare function migrate(
  up: (app: any) => any,
  down: (app: any) => any
): void;

declare class Field {
  constructor(config: any);
}

declare function unmarshal(data: any, target: any): void;