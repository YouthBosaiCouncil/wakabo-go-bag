import { clientAuth, participantUser } from "./firebase";
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    participant?: boolean;
  } = {},
): Promise<T> {
  const auth = clientAuth();
  const user = options.participant
    ? await participantUser()
    : (await auth.authStateReady(), auth.currentUser);
  if (!user) throw new Error("ログインしてください。");
  const response = await fetch(`/api/workspace${path}`, {
    method: options.method ?? "GET",
    cache: "no-store",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "通信に失敗しました。");
  return data as T;
}
