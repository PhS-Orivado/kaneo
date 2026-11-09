import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { sendTestEmail } from "./send-email";

const smtp = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sharedSend: vi.fn(),
  testSend: vi.fn(),
  close: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  createTransport: smtp.createTransport.mockImplementation((options) =>
    options.connectionTimeout
      ? { sendMail: smtp.testSend, close: smtp.close }
      : { sendMail: smtp.sharedSend },
  ),
}));
vi.mock("dotenv-mono", () => ({ config: () => {} }));

describe("sendTestEmail", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("bounds only the test transport and closes it after a stalled send fails", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_FROM", "kaneo@example.test");
    smtp.testSend.mockRejectedValue(
      Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
    );

    await expect(
      sendTestEmail("admin@example.test", "Test", {}),
    ).rejects.toMatchObject({ code: "ETIMEDOUT" });

    expect(smtp.createTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      }),
    );
    expect(smtp.sharedSend).not.toHaveBeenCalled();
    expect(smtp.close).toHaveBeenCalledOnce();
  });

  it("reports the acceptance line, message ID, recipient verdicts and timing", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_FROM", "kaneo@example.test");
    smtp.testSend.mockResolvedValue({
      messageId: "<kaneo-1234@example.test>",
      response: "250  2.0.0  Ok: queued as 4C1A2B\n250 bye",
      accepted: ["admin@example.test"],
      rejected: [],
    });

    const result = await sendTestEmail("admin@example.test", "Test", {});

    expect(result).toEqual({
      success: true,
      messageId: "<kaneo-1234@example.test>",
      response: "250 2.0.0 Ok: queued as 4C1A2B 250 bye",
      acceptedRecipients: 1,
      rejectedRecipients: 0,
      elapsedMs: expect.any(Number),
    });
  });

  it("fails when the relay resolves without accepting the only recipient", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_FROM", "kaneo@example.test");
    smtp.testSend.mockResolvedValue({
      messageId: "<kaneo-1234@example.test>",
      response: "250 Ok",
      accepted: [],
      rejected: ["admin@example.test"],
    });

    await expect(
      sendTestEmail("admin@example.test", "Test", {}),
    ).rejects.toMatchObject({ code: "EENVELOPE" });
  });
});
