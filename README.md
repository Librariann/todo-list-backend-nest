# Growdo NestJS Backend

기존 `todo-list-backend` Spring Boot 서버를 NestJS + TypeORM으로 옮긴 호환 구현입니다. 프론트엔드의 기존 `NEXT_PUBLIC_API_URL=http://localhost:8080` 설정을 변경하지 않고 사용할 수 있습니다.

## 포함 기능

- 이메일 회원가입·로그인, JWT access/refresh, Redis 세션, 로그아웃
- Google/Kakao/Naver OAuth2 Authorization Code + PKCE
- OAuth URL에는 60초짜리 Growdo 일회용 코드만 전달하고 Refresh Token은 HttpOnly 쿠키로 보호
- 사용자, 할 일, 습관·일별 로그·스트릭, 목표·주기·스트릭
- 챌린지 진행 및 포인트 지급, 보상 구매·사용, 사용자 요약
- Swagger (`/swagger-ui.html`)와 공통 `ApiResponse<T>` 응답
- 기존 PostgreSQL `todo_list` 스키마/테이블/컬럼명 호환

## 실행

```bash
cp .env.example .env
npm install
npm run start:dev
```

기존 DB 스키마를 그대로 사용할 때는 `DB_SYNC=false`를 유지합니다. 빈 개발 DB에 테이블을 자동 생성하려면 최초 실행에만 `DB_SYNC=true`를 사용한 뒤 다시 `false`로 돌리는 것을 권장합니다.

프론트엔드는 `.env.local`에서 아래 주소를 사용합니다.

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8080
```

OAuth를 사용할 경우 각 공급자의 콘솔에 콜백 URI를 등록합니다.

- `http://localhost:8080/login/oauth2/code/google`
- `http://localhost:8080/login/oauth2/code/kakao`
- `http://localhost:8080/login/oauth2/code/naver`

## 주요 명령

```bash
npm run build
npm run start:dev
npm run lint
```

환경변수의 DB 비밀번호, JWT 비밀키, OAuth client secret은 저장소에 커밋하지 마세요.
