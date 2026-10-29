# Character Development backend

This AWS SAM function accepts one to six compressed photographs and returns an environment reading plus three ranked character-development activity drafts.

The function reads an existing OpenAI key from AWS Secrets Manager, so the key is reused without placing it in GitHub or the browser. Pass the existing secret name as the `OpenAISecretId` deployment parameter. The secret should contain either:

```json
{"OPENAI_API_KEY":"sk-proj-..."}
```

or the raw key value. Never commit a key to this repository.
