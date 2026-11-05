# Todo List NestJS Backend

## 추천 연동

추천 생성 요청을 받으면 인증된 사용자의 최근 기록과 피드백을 요약해 프롬프트를 구성합니다. NestJS가 Qwen 모델 서버의 `/v1/chat/completions`를 직접 호출하고, 반환된 후보의 기록 근거, 날짜, 유형별 설정, 중복을 검증한 뒤 저장합니다. 추천을 수락하면 기존 할 일·습관·목표 서비스로 등록합니다.

개발 환경의 `.env.dev` 또는 배포 환경에 설정합니다.

```dotenv
QWEN_BASE_URL=http://127.0.0.1:8091/v1
QWEN_API_KEY=<todo-list-ai의 QWEN_API_KEY와 같은 32자 이상 토큰>
QWEN_MODEL=Qwen/Qwen3-4B-Instruct-2507
AI_RECOMMENDATIONS_TIMEOUT_MS=100000
```

원격 모델 서버는 HTTPS 주소를 사용합니다. Python 모델 서버와 GPU 설정은 [별도 AI 프로젝트](../todo-list-ai/README.md)에 있습니다. 운영에서 처음 활성화할 때는 [추천 DB 마이그레이션](migrations/20261030_add_ai_recommendations.sql)을 적용합니다.
