import 'reflect-metadata';
import { validate } from 'class-validator';
import { UpdateUserRoleDto } from './admin.dto';

describe('UpdateUserRoleDto', () => {
  it.each(['cotista', 'afiliado', 'operacao', 'admin'])('aceita o perfil %s', async (papel) => {
    expect(await validate(Object.assign(new UpdateUserRoleDto(), { papel }))).toHaveLength(0);
  });
  it.each(['root', '', 'ADMIN'])('recusa o perfil %j', async (papel) => {
    expect(await validate(Object.assign(new UpdateUserRoleDto(), { papel }))).not.toHaveLength(0);
  });
});
