export type WebViewFetchOptions = {
  beforeContentScript?: string;
  userAgent?: string;
  timeoutMs?: number;
};

export type WebViewLoadResult = {
  html: string;
  text: string;
  url: string;
  title: string;
};

export type WebViewNavigateResult = {
  url: string;
  title?: string;
};

function hostRuntimeOnly(name: string): Error {
  return new Error(`@libs/webView.${name} is provided by the Norea host.`);
}

export async function webViewFetch(
  url: string,
  options?: WebViewFetchOptions,
): Promise<string> {
  void url;
  void options;
  throw hostRuntimeOnly('webViewFetch');
}

export async function webViewLoad(
  url: string,
  options?: WebViewFetchOptions,
): Promise<WebViewLoadResult> {
  void url;
  void options;
  throw hostRuntimeOnly('webViewLoad');
}

export async function webViewNavigate(
  url: string,
  options?: WebViewFetchOptions,
): Promise<WebViewNavigateResult> {
  void url;
  void options;
  throw hostRuntimeOnly('webViewNavigate');
}
