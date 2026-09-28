import { ValueTransformer } from 'typeorm';

export const bigintToNumber: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | null): number | null | undefined => {
    if (value === null || value === undefined) return value as null | undefined;
    return Number(value);
  },
};
