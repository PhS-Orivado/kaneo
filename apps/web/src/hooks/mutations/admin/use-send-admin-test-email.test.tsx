import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { sendAdminTestEmail } from "@/fetchers/admin/send-admin-test-email";
import { toast } from "@/lib/toast";
import useSendAdminTestEmail from "./use-send-admin-test-email";

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: null }),
}));
vi.mock("@/fetchers/admin/send-admin-test-email", () => ({
  sendAdminTestEmail: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(cleanup);

const auditKey = ["admin", "audit-log", "admin-id", "email", 0];

function renderSend() {
  const client = new QueryClient({
    defaultOptions: { queries: { refetchOnMount: false } },
  });
  const reloadAudit = vi.fn().mockResolvedValue({
    entries: [{ id: "sent" }],
    total: 1,
  });
  client.setQueryDefaults(auditKey, { queryFn: reloadAudit });
  client.setQueryData(auditKey, { entries: [], total: 0 });
  const hook = renderHook(useSendAdminTestEmail, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, reloadAudit, ...hook };
}

describe("useSendAdminTestEmail", () => {
  it("refreshes previously visited audit pages after a successful send", async () => {
    vi.mocked(sendAdminTestEmail).mockResolvedValue({
      sent: true,
      to: "admin@example.test",
      messageId: "<kaneo-1234@example.test>",
      response: "250 2.0.0 Ok: queued as 4C1A2B",
      acceptedRecipients: 1,
      rejectedRecipients: 0,
      elapsedMs: 12,
    });
    const { client, result } = renderSend();

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(toast.success).toHaveBeenCalledWith(
      "settings:adminSystem.toast.testEmailSent",
      expect.objectContaining({
        description:
          "250 2.0.0 Ok: queued as 4C1A2B · message <kaneo-1234@example.test> · 12 ms",
      }),
    );
    await waitFor(() => {
      expect(client.getQueryData(auditKey)).toEqual({
        entries: [{ id: "sent" }],
        total: 1,
      });
    });
    client.clear();
  });

  it("leaves audit entries current when the send fails", async () => {
    vi.mocked(sendAdminTestEmail).mockRejectedValue(new Error("Send failed"));
    const { client, reloadAudit, result } = renderSend();

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("Send failed");
    });

    expect(client.getQueryState(auditKey)?.isInvalidated).toBe(false);
    expect(reloadAudit).not.toHaveBeenCalled();
    client.clear();
  });
});
