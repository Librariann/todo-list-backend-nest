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
import type { RegisterDto } from "./dto/register-users.dto";

export interface UserOutput {
  id: number;
  nickname: string;
  email: string;
  name: string | null;
  phoneNumber: string | null;
  status: UserStatus;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export function userResponse(user: User): UserOutput {
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
  async register(dto: RegisterDto): Promise<UserOutput> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException(
        "비밀번호와 비밀번호 확인이 일치하지 않습니다.",
      );
    }

    if (await this.users.exists({ where: { nickname: dto.nickname } })) {
      throw new ConflictException(
        `이미 사용 중인 사용자명입니다: ${dto.nickname}`,
      );
    }
    if (await this.users.exists({ where: { email: dto.email } })) {
      throw new ConflictException(`이미 사용 중인 이메일입니다: ${dto.email}`);
    }

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
  async byId(id: number): Promise<UserOutput> {
    const user = await this.users.findOneBy({ id });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    return userResponse(user);
  }
  async byNickname(nickname: string): Promise<UserOutput> {
    const user = await this.users.findOneBy({ nickname });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다.");
    return userResponse(user);
  }
  async active(): Promise<UserOutput[]> {
    return (await this.users.findBy({ status: UserStatus.ACTIVE })).map(
      userResponse,
    );
  }

  //닉네임 중복 확인
  nicknameAvailable(nickname: string): Promise<boolean> {
    return this.users.exists({ where: { nickname } }).then((exists) => !exists);
  }

  //이메일 중복 확인
  emailAvailable(email: string): Promise<boolean> {
    return this.users.exists({ where: { email } }).then((exists) => !exists);
  }
}
