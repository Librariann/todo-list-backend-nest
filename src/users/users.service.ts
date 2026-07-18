import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";
import { User, UserRole, UserStatus } from "../entities/user.entity";

export function userResponse(user: User) {
  return {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    name: user.name,
    phoneNumber: user.phoneNumber,
    status: user.status,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}
  async register(dto: {
    nickname: string;
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    phoneNumber?: string;
    role?: UserRole;
  }) {
    if (dto.password !== dto.confirmPassword)
      throw new BadRequestException(
        "비밀번호와 비밀번호 확인이 일치하지 않습니다.",
      );
    if (await this.users.exists({ where: { nickname: dto.nickname } }))
      throw new ConflictException(
        `이미 사용 중인 사용자명입니다: ${dto.nickname}`,
      );
    if (await this.users.exists({ where: { email: dto.email } }))
      throw new ConflictException(`이미 사용 중인 이메일입니다: ${dto.email}`);
    const user = this.users.create({
      nickname: dto.nickname,
      name: dto.name,
      email: dto.email,
      password: await bcrypt.hash(dto.password, 12),
      phoneNumber: dto.phoneNumber ?? null,
      provider: null,
      providerId: null,
      status: UserStatus.ACTIVE,
      role: dto.role ?? UserRole.USER,
    });
    return userResponse(await this.users.save(user));
  }
  async byId(id: number) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다.");
    return userResponse(user);
  }
  async byNickname(nickname: string) {
    const user = await this.users.findOneBy({ nickname });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다.");
    return userResponse(user);
  }
  async active() {
    return (await this.users.findBy({ status: UserStatus.ACTIVE })).map(
      userResponse,
    );
  }
  nicknameAvailable(nickname: string) {
    return this.users.exists({ where: { nickname } }).then((exists) => !exists);
  }
  emailAvailable(email: string) {
    return this.users.exists({ where: { email } }).then((exists) => !exists);
  }
}
