// Public runtime configuration. Never put OPENAI_API_KEY in this file.
// Replace these placeholders after the AWS SAM deployment.
window.GJI_CPD_CONFIG = {
  apiUrl: "",
  cognito: {
    domain: "",
    clientId: "",
    redirectUri: window.location.origin + window.location.pathname
  }
};
