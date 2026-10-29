// Public runtime configuration. Never put OPENAI_API_KEY in this file.
// Replace these placeholders after the AWS SAM deployment.
window.CHARACTER_LAB_CONFIG = {
  apiUrl: "",
  cognito: {
    domain: "",
    clientId: "",
    redirectUri: window.location.origin + window.location.pathname
  }
};
