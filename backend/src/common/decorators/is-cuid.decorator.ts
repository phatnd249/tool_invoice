import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const CUID_REGEX = /^c[a-z0-9]{24}$/;

export function IsCuid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCuid',
      target: object.constructor,
      propertyName,
      options: {
        message: ({ property }: ValidationArguments) =>
          `${property} phải là mã ID hợp lệ`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (Array.isArray(value)) {
            return value.every(
              (v) => typeof v === 'string' && CUID_REGEX.test(v),
            );
          }
          return typeof value === 'string' && CUID_REGEX.test(value);
        },
      },
    });
  };
}
