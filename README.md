# Character Development Lab

An MVP for turning an environment into purposeful character-development experiences: upload up to six photographs, enter a written description, or use both. The system analyses the place through four educational lenses and generates three ranked character-development experiences grounded in the uploaded CPD reference.

## What is included

- Multi-photo environment upload, written environment description, or both together.
- Foundation, Development and Mastery phase selection.
- Year group, group size, setting, duration and session-type inputs.
- Four visual lenses: objects/materials/tools; colours/shapes/patterns/measurements; nature/living systems/physical forces; culture/language/art/sustainability.
- Three ranked AI-draft experiences with service, challenge, Al Sanaa', heritage, inclusion, reflection, evidence and safeguarding fields.
- “Generate more” variation pass.
- TXT plan export.
- Cognito sign-in using OAuth PKCE.
- AWS SAM backend using an existing Secrets Manager key supplied at deployment.
- `backend/cpd_reference.txt`: the uploaded CPD guide used as the internal programme reference.

## Repository

This MVP is intended for the public `elmrad/eduhub` repository. The OpenAI key is not in the frontend, source code or GitHub files.

## Deployment outline

1. Deploy the backend in `backend/` with AWS SAM in `us-east-1`.
2. Pass the exact hosted portal URL as `PortalUrl` and a unique lowercase value as `CognitoDomainPrefix`.
3. Pass the existing Secrets Manager secret name as `OpenAISecretId` to reuse the current key.
4. Copy the SAM outputs into `config.js`: `AnalysisApiUrl`, `CognitoDomain`, `CognitoClientId` and the portal URL as `redirectUri`.
5. Deploy the repository root as a static Amplify application.
6. Create teacher users in the new Cognito user pool. Do not make the API public for a school deployment.

## Important

The generated plans are AI-DRAFTs. A named educator/programme lead must review the activity, cultural framing, inclusion route, partner requirements and safeguarding controls before delivery. The application is a planning assistant, not a risk-assessment or approval system.
