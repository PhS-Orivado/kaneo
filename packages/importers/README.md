# @kaneo/importers

This package reads projects from external services (Jira, PLANKA, Plane, Linear, Trello, and other Kaneo instances) into one shared import model defined in `src/types.ts`.

## Import model

Every importer maps its native records onto the shared types (`ImportedProject`, `ImportedTask`, `ImportedColumn`, `ImportedRelation`, `ImportedAttachment`). The API consumes only these shared types, never importer-specific shapes.

## Attachments

Attachments follow the same rule. Each importer maps its native attachment records onto `ImportedAttachment`:

```ts
type ImportedAttachment = {
  key: string;        // stable source identifier, used to match downloads
  filename: string;
  mimeType?: string;
  size?: number;
  contentUrl?: string; // absolute URL the importer can download the file from
};
```

- For Jira, this mapping lives in `src/jira/mapping.ts` (`mapAttachments`). Downloading happens through the optional `downloadAttachment` hook on the opened source, implemented in `src/jira/source.ts`.
- The API side plans and stores attachments in `apps/api/src/import/writer/write-import-attachments.ts` and links them into task descriptions with `rewrite-attachment-links.ts`.

When changing the attachment shape, update `src/types.ts` and every importer that maps into it; do not add per-importer attachment modules that duplicate the shared mapping.

## Building

Run `pnpm run build` in this directory (or `vp run compile` from the workspace root) to type-check and emit the package. The Docker build of `kaneo-api` runs this build, so a TypeScript error anywhere under `src` fails the image build.
