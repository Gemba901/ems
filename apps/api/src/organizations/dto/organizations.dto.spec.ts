import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateOrganizationDto } from './organizations.dto';

describe('CreateOrganizationDto slug', () => {
  it.each([undefined, null, '', 123])('rejects missing/invalid slug %s', async (slug) => {
    const dto = Object.assign(new CreateOrganizationDto(), { slug });
    expect((await validate(dto)).some((error) => error.property === 'slug')).toBe(true);
  });
  it('accepts a required string slug', async () => {
    const dto = Object.assign(new CreateOrganizationDto(), { slug: 'acme' });
    expect((await validate(dto)).some((error) => error.property === 'slug')).toBe(false);
  });
});
