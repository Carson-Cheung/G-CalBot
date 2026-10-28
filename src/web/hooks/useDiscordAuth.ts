import { useCallback, useEffect, useMemo, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { api } from '../api';
import { DEMO_USER_ID, SESSION_STORAGE_KEY } from '../constants';
import type { DiscordUser } from '../types';
import { safeStorage } from '../utils/storage';
import { getUserId } from '../utils/user';
import type { Notify } from './useToast';

const sdkCache = new Map<string, DiscordSDK>();

// One SDK instance per client id: each constructor registers its own window message listener.
function getSdk(clientId: string): DiscordSDK {
  let sdk = sdkCache.get(clientId);
  if (!sdk) {
    sdk = new DiscordSDK(clientId);
    sdkCache.set(clientId, sdk);
  }
  return sdk;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function detectInsideDiscord(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('frame_id')) || window.parent !== window;
  } catch {
    return false;
  }
}

async function resolveClientId(params: URLSearchParams): Promise<string | null> {
  const fromUrl = params.get('client_id');
  if (fromUrl) return fromUrl;
  const hostPrefix = window.location.hostname.split('.')[0];
  if (/^\d{15,22}$/.test(hostPrefix)) return hostPrefix;
  try {
    const cfg = await api.getConfig();
    return cfg.clientId || null;
  } catch {
    return null;
  }
}

async function requestSession(code: string): Promise<{ user: DiscordUser; token: string | null } | null> {
  try {
    const data = await api.exchangeCode(code);
    if (!data.user) return null;
    return { user: data.user, token: data.sessionToken || data.access_token || null };
  } catch {
    return null;
  }
}

export function useDiscordAuth(notify: Notify) {
  const isInsideDiscord = useMemo(detectInsideDiscord, []);

  const [userId, setUserId] = useState(DEMO_USER_ID);
  const [isDemo, setIsDemo] = useState(true);
  const [authUser, setAuthUser] = useState<DiscordUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const applySession = useCallback((user: DiscordUser, token: string | null) => {
    if (token) {
      safeStorage.setItem(SESSION_STORAGE_KEY, token);
      setSessionToken(token);
    }
    setAuthUser(user);
    setUserId(getUserId(user));
    setIsDemo(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const authenticate = async () => {
      setAuthLoading(true);

      const params = new URLSearchParams(window.location.search);
      const frameId = params.get('frame_id');

      const sessionParam = params.get('session');
      if (sessionParam) {
        safeStorage.setItem(SESSION_STORAGE_KEY, sessionParam);
        if (!frameId) {
          try {
            const cleanSearch = window.location.search
              .replace(/([?&])session=[^&]+(&|$)/, '$1')
              .replace(/[?&]$/, '');
            window.history.replaceState({}, '', window.location.pathname + cleanSearch);
          } catch {
            // history API can be blocked in restricted contexts
          }
        }
      }

      const insideDiscord = Boolean(frameId) || window.parent !== window;

      if (insideDiscord) {
        let clientId = await resolveClientId(params);
        let sdk: DiscordSDK | null = null;

        // Discord keeps its loading screen up until ready() is sent, so always do it when frame_id is present.
        if (frameId && clientId) {
          try {
            try {
              window.parent.postMessage(
                [0, { v: 1, encoding: 'json', client_id: clientId, frame_id: frameId, sdk_version: '2.5.0' }],
                '*'
              );
            } catch {
              // the SDK performs its own handshake below
            }
            sdk = getSdk(clientId);
            await withTimeout(sdk.ready(), 2500, 'DiscordSDK ready timeout');
          } catch (readyErr) {
            console.warn('DiscordSDK ready handshake warning:', readyErr);
          }
        }

        if (!sessionParam && !cancelled) {
          try {
            if (!clientId) clientId = await resolveClientId(params);

            if (clientId) {
              const activeSdk = sdk || getSdk(clientId);
              if (!sdk) await withTimeout(activeSdk.ready(), 3500, 'DiscordSDK ready timeout');

              let code: string | null = null;
              try {
                // Resolves in ~20ms when the user already authorized this app.
                const silent = await withTimeout(
                  activeSdk.commands.authorize({
                    client_id: clientId,
                    response_type: 'code',
                    state: '',
                    prompt: 'none',
                    scope: ['identify'],
                  }),
                  2000,
                  'Silent check skipped'
                );
                code = silent.code;
              } catch {
                // No timeout here: wait for the user to answer Discord's consent dialog.
                try {
                  const interactive = await activeSdk.commands.authorize({
                    client_id: clientId,
                    response_type: 'code',
                    state: '',
                    scope: ['identify'],
                  });
                  code = interactive.code;
                } catch (dismissed) {
                  console.info('User dismissed Discord authorization modal:', dismissed);
                }
              }

              if (code && !cancelled) {
                const session = await requestSession(code);
                if (session && !cancelled) {
                  applySession(session.user, session.token);
                  setAuthLoading(false);
                  return;
                }
              }
            }
          } catch (sdkErr) {
            console.warn('DiscordSDK authorization fallback:', sdkErr);
          }
        }
      }

      if (cancelled) return;

      if (!insideDiscord) {
        const storedToken = safeStorage.getItem(SESSION_STORAGE_KEY);
        if (storedToken) {
          try {
            const session = await api.verifySession(storedToken);
            if (cancelled) return;
            if (session.authenticated && session.user) {
              applySession(session.user, storedToken);
              setAuthLoading(false);
              return;
            }
          } catch {
            // invalid or expired token; dropped below
          }
          safeStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } else {
        safeStorage.removeItem(SESSION_STORAGE_KEY);
      }

      if (cancelled) return;
      if (!insideDiscord) void api.startDemoHandoff();
      setUserId(DEMO_USER_ID);
      setIsDemo(true);
      setAuthUser(null);
      setSessionToken(null);
      setAuthLoading(false);
    };

    authenticate();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const loginWithDiscord = useCallback(async () => {
    setAuthLoading(true);
    try {
      const clientId = await resolveClientId(new URLSearchParams(window.location.search));
      if (!clientId) throw new Error('Missing Discord Client ID');

      const sdk = getSdk(clientId);
      await sdk.ready();

      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        scope: ['identify'],
      });

      const session = code ? await requestSession(code) : null;
      if (session) {
        applySession(session.user, session.token);
        notify(`Signed in as @${session.user.global_name || session.user.username}!`, 'success');
        return;
      }
      notify('Could not complete Discord authentication', 'error');
    } catch (err) {
      console.warn('Manual login error:', err);
      notify('Discord sign-in was cancelled or timed out.', 'info');
    } finally {
      setAuthLoading(false);
    }
  }, [applySession, notify]);

  const enterDemo = useCallback(() => {
    setUserId(DEMO_USER_ID);
    setIsDemo(true);
    void api.startDemoHandoff();
  }, []);

  const signOut = useCallback(() => {
    safeStorage.removeItem(SESSION_STORAGE_KEY);
    setAuthUser(null);
    setSessionToken(null);
    enterDemo();
    notify('Signed out of personal session. Switched to Public Demo Showcase.', 'info');
  }, [enterDemo, notify]);

  const toggleDemo = useCallback(() => {
    if (isDemo && authUser) {
      setUserId(getUserId(authUser));
      setIsDemo(false);
      notify(`Welcome back, ${authUser.global_name || authUser.username}!`, 'success');
    } else {
      enterDemo();
      notify('Viewing Public Demo Showcase mode', 'info');
    }
  }, [isDemo, authUser, enterDemo, notify]);

  return {
    isInsideDiscord,
    userId,
    isDemo,
    authUser,
    sessionToken,
    authLoading,
    loginWithDiscord,
    signOut,
    toggleDemo,
  };
}
