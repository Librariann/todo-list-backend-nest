import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserStatus } from "../entities/user.entity";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { SessionService } from "./session.service";

interface TokenPayload {
  sub: string;
  sessionId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: User }>();
    const token = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : null;
    if (!token) throw new UnauthorizedException("인증이 필요합니다.");
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token);
      if (
        payload.sessionId &&
        !(await this.sessions.isValid(payload.sessionId))
      ) {
        throw new UnauthorizedException("유효하지 않은 세션입니다.");
      }
      const user = await this.users.findOne({
        where: { email: payload.sub, status: UserStatus.ACTIVE },
      });
      if (!user) throw new UnauthorizedException("사용자를 찾을 수 없습니다.");
      request.user = user;
      return true;
    } catch (cause) {
      if (cause instanceof UnauthorizedException) throw cause;
      throw new UnauthorizedException("유효하지 않거나 만료된 토큰입니다.");
    }
  }
}
