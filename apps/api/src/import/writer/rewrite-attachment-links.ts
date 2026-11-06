import type { ImportedAttachment } from "@kaneo/importers";

export type AttachmentLinkRewrite = {
  pattern: RegExp;
  url: string;
};

const URL_TAIL = String.raw`[^\s"'<>)\]]*`;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The source URL base of an attachment, e.g. https://host/jira. */
function attachmentUrlBase(attachment: ImportedAttachment): string {
  return attachment.url.replace(
    /\/rest\/api\/\d+\/attachment\/content\/\d+\/?$/,
    "",
  );
}

/** Base path of the source site, e.g. "/jira" on Data Center, "" in the cloud. */
function attachmentBasePath(base: string): string {
  try {
    return new URL(base).pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Builds patterns for every way Jira references an attachment in text: the
 * browse URL (`.../secure/attachment/{id}/{filename}`) and the content URL
 * (`.../rest/api/{v}/attachment/content/{id}`), absolute or relative. The
 * lookbehind keeps relative patterns from matching inside a longer URL.
 */
export function buildAttachmentLinkRewrites(
  attachments: readonly ImportedAttachment[],
  urlFor: (attachmentId: string) => string | null,
): AttachmentLinkRewrite[] {
  const rewrites: AttachmentLinkRewrite[] = [];

  for (const attachment of attachments) {
    const target = urlFor(attachment.id);
    if (!target) continue;

    const base = escapeRegExp(attachmentUrlBase(attachment));
    const basePath = escapeRegExp(attachmentBasePath(base));
    const id = escapeRegExp(attachment.id);
    const relative = String.raw`(?<![\w])`;

    // The trailing boundary keeps an id from matching inside a longer one
    // (attachment 10000 inside 100001) when no filename follows the id.
    const stems = [
      String.raw`${base}\/secure\/attachment\/${id}(\/${URL_TAIL})?(?![\w])`,
      String.raw`${base}\/rest\/api\/\d+\/attachment\/content\/${id}(\/${URL_TAIL})?(?![\w])`,
      String.raw`${relative}\/secure\/attachment\/${id}(\/${URL_TAIL})?(?![\w])`,
      String.raw`${relative}\/rest\/api\/\d+\/attachment\/content\/${id}(\/${URL_TAIL})?(?![\w])`,
    ];
    if (basePath) {
      stems.push(
        String.raw`${relative}${basePath}\/secure\/attachment\/${id}(\/${URL_TAIL})?(?![\w])`,
        String.raw`${relative}${basePath}\/rest\/api\/\d+\/attachment\/content\/${id}(\/${URL_TAIL})?(?![\w])`,
      );
    }

    for (const stem of stems) {
      rewrites.push({ pattern: new RegExp(stem, "g"), url: target });
    }
  }

  return rewrites;
}

export function rewriteAttachmentLinks(
  text: string,
  rewrites: readonly AttachmentLinkRewrite[],
): string {
  let updated = text;
  for (const rewrite of rewrites) {
    updated = updated.replace(rewrite.pattern, rewrite.url);
  }
  return updated;
}
