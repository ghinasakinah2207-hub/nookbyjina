/* eslint-disable @typescript-eslint/no-require-imports */
// Preload script to mock 'server-only' when running test scripts outside Next.js bundling environment
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === "server-only") {
    return {};
  }
  if (id === "next/cache") {
    return {
      revalidatePath: () => {},
      revalidateTag: () => {},
      unstable_cache: (fn) => fn,
    };
  }
  if (id === "next/headers") {
    return {
      cookies: async () => ({
        getAll: () => [],
        get: () => undefined,
        set: () => {},
        delete: () => {},
      }),
      headers: async () => new Headers(),
    };
  }

  const result = originalRequire.apply(this, arguments);

  if (
    typeof id === "string" &&
    (id.endsWith("/supabase/server") ||
      id.endsWith("/supabase/server.ts") ||
      id === "@/lib/supabase/server")
  ) {
    if (result && result.createServerSupabaseClient) {
      const origCreateServer = result.createServerSupabaseClient;
      return {
        ...result,
        createServerSupabaseClient: async function () {
          const client = await origCreateServer();
          const origFrom = client.from.bind(client);
          const origAuth = client.auth;

          return new Proxy(client, {
            get(target, prop) {
              if (prop === "auth") {
                return new Proxy(origAuth, {
                  get(authTarget, authProp) {
                    if (authProp === "getUser") {
                      return async () => ({
                        data: {
                          user: {
                            id: "00000000-0000-0000-0000-000000000001",
                            email: "admin-test@nookbyjina.com",
                          },
                        },
                        error: null,
                      });
                    }
                    return Reflect.get(authTarget, authProp);
                  },
                });
              }

              if (prop === "from") {
                return function (relation) {
                  if (relation === "admin_users") {
                    return {
                      select: () => ({
                        eq: () => ({
                          maybeSingle: async () => ({
                            data: { user_id: "00000000-0000-0000-0000-000000000001" },
                            error: null,
                          }),
                        }),
                      }),
                    };
                  }
                  return origFrom(relation);
                };
              }

              return Reflect.get(target, prop);
            },
          });
        },
      };
    }
  }

  return result;
};
