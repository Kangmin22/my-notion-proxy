{
  "schema_version": "v1",
  "name_for_human": "LangScript Manager",
  "name_for_model": "LangScriptManager",
  "description_for_human": "프롬프트 업로드·조회·실행 기능을 제공하는 API 플러그인입니다.",
  "description_for_model": "Use these endpoints to upload, list, retrieve, and run prompt files stored in Blob.",
  "auth": {
    "type": "service_http",
    "authorization_type": "bearer"
  },
  "api": {
    "type": "openapi",
    "url": "https://my-notion-proxy.vercel.app/.well-known/openapi.yaml",
    "is_user_authenticated": true
  },
  "logo_url": "https://my-notion-proxy.vercel.app/logo.png",
  "contact_email": "support@example.com",
  "legal_info_url": "https://example.com/legal"
}
