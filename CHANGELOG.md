### Bug Fixes

- **web:** repair the broken JSX in the backlog route that failed the web image build: the loading-skeleton branch lost its closing `</div>` and kept an orphaned closing tag, so the route could not be parsed (restores the file to match the develop branch)
- **db:** resolve the upstream merge conflicts from PR #98 on deploy, repair migration journal ordering, and renumber the upstream project subtasks migration to 0076_thick_talisman
- **importers:** remove a dead Jira attachments module that failed the TypeScript build: [b7640f2](https://github.com/PhS-Orivado/kaneo/commit/b7640f24ab01d50f5adb86fec6728a50a3e9d83c)

### Documentation

- **db:** document migration journal timestamp ordering and the 0076 renumbering: see `docs/database/migration-journal-ordering.md`
- **importers:** document the shared import model and where Jira attachments are mapped: see `packages/importers/README.md` in the same commit range

### Features

- **project:** per-project include_subtasks setting with a board display toggle and calendar subtask handling, merged from upstream main (PR #98)
- **web:** steady boot, navigation and loading: [6a9f671](https://github.com/usekaneo/kaneo/commit/6a9f6715cac94f92b8e0e7e93319af74a4b7a77a)
- **api:** create pull request links via the api: [d4df89a](https://github.com/usekaneo/kaneo/commit/d4df89a0dbc34adf3926943d9ba4aadd81338b77)
- **mobile:** edit task descriptions inline with autosave: [9030b0e](https://github.com/usekaneo/kaneo/commit/9030b0e8caddb2c8d44cc427e21d6f8139758151)
- **editor:** share the rich text schema between web and mobile: [41a9dbc](https://github.com/usekaneo/kaneo/commit/41a9dbcd3ba869fc3f9a9c74287e49854ae46cd6)
- **mobile:** align the app with the web design system: [603c1da](https://github.com/usekaneo/kaneo/commit/603c1da1240d80042bf2eabf84b3ee9899f23214)
- **mobile:** unlock self-hosted servers with a one-time purchase: [cf006d4](https://github.com/usekaneo/kaneo/commit/cf006d408c9ac7c446ef2392afbc81fad1376170)
- **ci:** adding mellon observation: #2153
- **web:** make the current page stand out in the sidebar: #2150
- **admin:** record administrative actions in an audit log: #2123
- lead marketing with Kaneo Cloud and fix app page titles: [b5b3e72](https://git
hub.com/usekaneo/kaneo/commit/b5b3e7270901bcb0550af544a8858278f66bccff)
- **tasks:** expand subtasks in the project list: #2115

### Bug Fixes

- **security:** protect workspace ownership and update vulnerable dependencies: #2176
- **web:** task sheet focus and swipe back: [d71736c](https://github.com/usekaneo/kaneo/commit/d71736cf06adbac5c1044479025520ac3ff819d4)
- **web:** declutter onboarding and fade on finish: [8cca207](https://github.com/usekaneo/kaneo/commit/8cca20778f08513b18e6bde9d0a920c9dee79820)
- **mobile:** cap board lane width so tablets show several columns: [7de7cf7](https://github.com/usekaneo/kaneo/commit/7de7cf74a5200e93d22fe468253e033e0621d8ff)
- **web:** avoid crypto.randomUUID on plain-HTTP origins: #2157
- **email:** keep the sign-in code in one piece: [b1fe0c5](https://github.com/usekaneo/kaneo/commit/b1fe0c54145cb28b01fba014f6f59cd471916308)
- **ci:** use the base policy pnpm version for title checks: #2137
- **web:** keep task dates inside the properties sidebar: #2132

### Performance Improvements

- **web:** keep board drags fast on big boards: [e7f991c](https://github.com/usekaneo/kaneo/commit/e7f991c1fb1f958407d4f57d71661f2ae20e9d27)

### Documentation

- refresh product screenshots from the current app: [7146953](https://github.com/usekaneo/kaneo/commit/714695319d8ec1c78c63e72c8b32f2e964a8b8a7)
- update sponsors: [cee8450](https://github.com/usekaneo/kaneo/commit/cee8450e8e334e4c9a8840bb472f9c018d90d94f)

### Credits

Huge thanks to @tinsever, @man-singh-dev, and @randoneering for helping!

### Features

- repeat tasks after completion: #2116
- **web:** let people switch back to the classic priority icons: [cdc097e](https://github.com/usekaneo/kaneo/commit/cdc097e41233f8356e8e595ea465c6dfa8dbca0e)
- **custom-fields:** hide retired selection options: #1803
- **auth:** manage profile fields and back-channel logout for custom OIDC: #2046
- **labels:** add ocean, sky, lagoon and orchid label colors: #2016

### Bug Fixes

- **mobile:** show
 older HTML task descriptions as formatted text instead of raw tags: #2126
- **mobile:** keep the comment box and board filter above the Android keyboard: #2124
- **web:** keep segmented control pills inside their track: #2125
- **web:** let you drag the next task while the last move is still saving: #2121
- **web:** upload every file dropped into an editor: #2114
- **web:** open the workspace members page from the command palette: #2049

### Credits

Huge thanks to @tinsever, @randoneering, @tiran133, and @Debug-Jeff for helping!

### Bug Fixes

- **security:** enforce authorization and harden outbound requests: #2106
- **web:** preserve custom OAuth logout redirects: #2103
- **web:** keep saved label filters matching new assignments: #2064
- **web:** paste markdown into the active editor: #2102
- **web:** match custom-field filters before opening tasks: #2063
- **i18n:** complete French translations: #2101
- allow project:update to edit workflow columns and project details: #2073
- **web:** color priority marks by level: [9293522](https://github.com/usekaneo/kaneo/commit/9293522d7f35c95f029c55d60dde34d79453efd9)
- **ci:** budget sequential quality checks: #2089
- **mobile:** restore Android startup and release 0.3.1: [56f6d00](https://github.com/usekaneo/kaneo/commit/56f6d00f14be7e4fc9061eba5391c92c4c3c3914)
- **ci:** restore nightly permissions: #2088
- **mobile:** upgrade to Expo SDK 58 so the app launches on iOS 27: [d3d1572](https://github.com/usekaneo/kaneo/commit/d3d1572626e6e117940370490f334e705a30adcf)

### Documentation

- update sponsors: [9ba2e34](https://github.com/usekaneo/kaneo/commit/9ba2e3431bd3682c7a879648a94514a42e3a3797)

### Credits

Huge thanks to @tinsever, @markussagens, @Hexalyse, and @randoneering for helping!

### Features

- **ci:** skip expensive checks for docs-only and site-only PRs: #2080
- **site:** group the guides index into topic sections: [83ce560](https://github.com/usekaneo/kaneo/commit/83ce56066a2ce1c2dbfa77d8bc8a8cd99afd8d66
)
- **site:** add 30 project management guides: [2e07236](https://github.com/usekaneo/kaneo/commit/2e072360282aa250b534c349b5a590b5fcee118c)
- **api:** make the database pool size configurable: #2042
- **mobile:** add Expo app for Android and iOS: #2029
- **web:** redesign task cards and the date picker: [8cceae1](https://github.com/usekaneo/kaneo/commit/8cceae17aacb8611f9fc94836c1158b0ff084605)
- **web:** animate sidebar and keep inset padding: [1b53391](https://github.com/usekaneo/kaneo/commit/1b53391ea2ca2a4a9e905ee210ae8f1530aed605)

### Bug Fixes

- **deps:** patch BrowserStack Git dependencies: #2086
- **mcp:** bound request validation: #2083
- **deps:** patch dompurify: #2082
- **deps:** patch critical vulnerabilities: #2081
- **deps:** remediate CVE-2026-90711: #2076
- **site:** tighten titles, descriptions, and heading order for search: [b701963](https://github.com/usekaneo/kaneo/commit/b7019630bcdf0eaa868eabecdcca64f50210ed5b)
- **web:** keep board columns scrollable with project backgrounds: [41074e9](https://github.com/usekaneo/kaneo/commit/41074e947458db74d5cbea26910d9854d512432a)
- **docker:** support OpenShift runtime storage: #1980
- **notifications:** skip self-assignment notifications: #2036
- **planka-import:** respect ratelimiting: #1944
- **api:** keep linked issues closed when a completed task is archived: #2032
- **api:** stop label webhook echoes from flipping task status: #2031
- **web:** let touch start drags on board cards: #2035
- **web:** keep list and backlog collapse state per project: #2034
- **mcp:** read and set task custom fields: #2033
- update slug with column name: #1930
- **api:** compute scheduled job lease expiry in UTC: #2030
- **e2e:** wait for the create task dialog to close: [e9c2c46](https://github.com/usekaneo/kaneo/commit/e9c2c46ea59cfd9fc3fe200dbec00bffb6735b0c)
- **import:** resolve renamed workflow column names: #2027
- **api:** import assignee email: #2028
- **i18n:** complete German translations: [d064445](https:/
/github.com/usekaneo/kaneo/commit/d0644451639dc0bbbca137e5ff2bace6e0217746)
- **e2e:** follow the redesigned signup and onboarding flow: #2024
- **web:** preserve blank paragraphs in task descriptions: #2025
- **mcp:** accept opaque OAuth state within URL bounds: #2026
- **i18n:** translate the zh-CN strings added since #1916: #2020
- **web:** show the priority mark in the bulk toast: [4c89504](https://github.com/usekaneo/kaneo/commit/4c89504dc4daa633bdfd7dbdc1f13c4338f51d2b)
- **web:** explain dates outside the allowed range: [b5fb8da](https://github.com/usekaneo/kaneo/commit/b5fb8da93ac80958950366fa45372806342ce7a9)
- **web:** only press cards from the card itself: [ba0dab7](https://github.com/usekaneo/kaneo/commit/ba0dab7c17e07ee4291b98e6c0fa9b157df636fc)
- **web:** stop chip taps opening the card menu: [62a19ad](https://github.com/usekaneo/kaneo/commit/62a19adfaf423d9e35b41ee8cc786ac667507357)
- **web:** keep task-key matches in global search: #2011
- **web:** drop deleted tasks from cached subtask lists: #2009
- **workflow-rule:** only accept event types the integrations fire: #1982
- **notifications:** encode non-ASCII ntfy titles: #1981
- **search:** return each workspace once in global search: #1979

### Performance Improvements

- **web:** open tasks without network waits: [42f1682](https://github.com/usekaneo/kaneo/commit/42f16821d74f15aaab56f3a5e67d92c52072a634)

### Documentation

- update sponsors: [2847dbd](https://github.com/usekaneo/kaneo/commit/2847dbd8a7c4ca4ac3c390924d5e03604ba6d79e)
- update sponsors: [302e358](https://github.com/usekaneo/kaneo/commit/302e358cb1f4c5b736b049a8795f478a3c70ecaf)

### Credits

Huge thanks to @randoneering, @tiran133, @tinsever, @SuperVK, @MonsPropre, @ApplesBear-X, @KyleJFischer, @irfanfaraaz, and @thejdubb02 for helping!

### Bug Fixes

- **web:** space tooltip labels from key hints: [85d2a84](https://github.com/usekaneo/kaneo/commit/85d2a8494b136da66b490288fb678fc67ac25ad8)

### Bug Fixes

- **api:** retry upload c
hecks only on 403: [8f5f735](https://github.com/usekaneo/kaneo/commit/8f5f73513dc5f5b255e9f387e5a95cbf904761c1)
- **api:** retry upload checks on 403 and 404: [b799520](https://github.com/usekaneo/kaneo/commit/b799520a19d2907783c5965e45a12e2ec7ea845c)

### Features

- **web:** redesign task details: [d9cb555](https://github.com/usekaneo/kaneo/commit/d9cb5558893c32c2202505afc5ca37f1c35ccd08)

### Bug Fixes

- **web:** keep key hints out of accessible names: [23b07b4](https://github.com/usekaneo/kaneo/commit/23b07b4931548a3bcfe29f81b7f5e333733d000a)

### Features

- **web:** add keyboard shortcuts across the app: [16648d4](https://github.com/usekaneo/kaneo/commit/16648d43c18ccdca5730f9323de421c0a6fac4f9)
- **api:** add notification unread and delete: [425a8af](https://github.com/usekaneo/kaneo/commit/425a8af085fe193204a0539878d6ff892b8c3d87)

### Bug Fixes

- **api:** log why upload verification fails: [6160046](https://github.com/usekaneo/kaneo/commit/6160046c234f3f31a4df473ca96f16ca14a31fba)

### Features

- **web:** redesign the bulk selection bar: [51af01d](https://github.com/usekaneo/kaneo/commit/51af01d77f07186b63bae8a290c4681e3e88c63d)
- **web:** edit links inline and make them legible: [9431c14](https://github.com/usekaneo/kaneo/commit/9431c14469bbc071642f83904e8f9a89d3bbaf5e)

### Features

- **web:** rework project views and custom fields: [93f328d](https://github.com/usekaneo/kaneo/commit/93f328d7382e6a54cfe615d7b94cf76a033b414f)

### Bug Fixes

- **site:** restore the gantt search placeholder: [3d79a67](https://github.com/usekaneo/kaneo/commit/3d79a670264da92ed8ad7f556d7deed5ac6c295d)

### Documentation

- describe project views and custom fields: [593cad3](https://github.com/usekaneo/kaneo/commit/593cad31af833b335d8689166fbe84b692b2e9af)
- **site:** surface in-app importers and retarget asana page: [0dd17d9](https://github.com/usekaneo/kaneo/commit/0dd17d92d17db0845747167c186a4d46ec02eb08)

### Features

- **web:** rebuild settings pages: [3f15710](https:
//github.com/usekaneo/kaneo/commit/3f15710726b51f976aa2040ff3d5683dbb97f003)
- **api:** edit custom fields and search repos: [793a50c](https://github.com/usekaneo/kaneo/commit/793a50ca66e8c0d0016c074b17b2d56fb0a7bc4b)

### Documentation

- describe the new settings pages: [b7e8190](https://github.com/usekaneo/kaneo/commit/b7e8190dd8f89718fc5800803cdca1397c829b8a)

### Features

- **web:** redesign onboarding with a live preview: [4bc1a9b](https://github.com/usekaneo/kaneo/commit/4bc1a9b4cb801fc6dd0faefbc7503231173186ad)

### Features

- **web:** redesign auth and access pages: [5565833](https://github.com/usekaneo/kaneo/commit/5565833474175ad42ac365ec2c1b992920277d78)
- **auth:** require email codes for cloud sign-up: [f974b05](https://github.com/usekaneo/kaneo/commit/f974b0529d36bc60caac510d169417633459f381)

### Bug Fixes

- **web:** read the turnstile key at runtime: [a0d8cbb](https://github.com/usekaneo/kaneo/commit/a0d8cbb080c7289109332fd7aee1785132ad5c6a)

### Features

- **import:** add Jira as an import source: #2010

### Credits

Huge thanks to @andrejsshell for helping!

### Features

- import projects from other tools in the UI: #2007

### Credits

Huge thanks to @andrejsshell for helping!

### Bug Fixes

- **email:** fix gmail mobile layout and icons: [2a41318](https://github.com/usekaneo/kaneo/commit/2a41318ab9e093441471396890e40384120668af)

### Features

- **email:** redesign emails with Kaneo components: [ed0ea78](https://github.com/usekaneo/kaneo/commit/ed0ea78838ba703e924c9446c4db344ad6e4d831)

### Documentation

- **site:** list Amazon SES as email subprocessor: [e71a17b](https://github.com/usekaneo/kaneo/commit/e71a17b34bdf8bf3c812773bd4f0a65b554303e9)

### Features

- start new workspaces with a starter project: #1993

### Bug Fixes

- **cli:** reject checksums that are not SHA-256 digests: #1996

### Documentation

- **cli:** add npm as an install option: #1995

### Credits

Huge thanks to @andrejsshell for helping!

### Features

- **cli:** ad
d an agent skill for the kaneo CLI: #1974
- **cli:** install the CLI with a one-line script: #1971

### Bug Fixes

- **build:** stop vp from replaying stale typechecks and builds: #1989
- make the app usable on phones: #1983
- **mcp:** omit session credentials from whoami: [cf44625](https://github.com/usekaneo/kaneo/commit/cf446256f39935e6067e70dbb57f429d4b7b7a5b)
- **cli:** point the update hint at the install page: #1976
- **cli:** say how to confirm in confirmation errors: #1975

### Credits

Huge thanks to @tinsever and @andrejsshell for helping!

### Features

- **cli:** add the official Kaneo command-line client: #1968
- **api:** add workspace list and detail endpoints: #1960
- allow manual AI comment scans for existing PRs: [70de375](https://github.com/usekaneo/kaneo/commit/70de375184e7908e8b54fda9abee37756ed20eb6)
- add advisory AI comment labeler: [d1a6a39](https://github.com/usekaneo/kaneo/commit/d1a6a392ed4c8dbc6873a8ad46de804cfadfbc3f)

### Bug Fixes

- **auth:** allow linking social accounts with different emails: [c613565](https://github.com/usekaneo/kaneo/commit/c61356534839adfd0c40b65325114d2fd69e4b25)
- **api:** answer rate-limited API keys with 429: #1961
- **api:** never treat API keys as user sessions: #1969
- **api:** return every error as JSON with a stable code: #1962
- **ci:** explain automatic pull request draft conversions: [5c42599](https://github.com/usekaneo/kaneo/commit/5c425995019c9f624110c0b84f117854a0c707d7)
- **api:** return 404 for missing and hidden resources: #1963
- **calendar:** allow feeds without label filters: #1958
- **site:** prevent theme flash during hydration: [6bd0c1a](https://github.com/usekaneo/kaneo/commit/6bd0c1ac42164ec2604a2e74538f6e084c684641)

### Credits

Huge thanks to @andrejsshell and @tinsever for helping!

### Features

- manage workspaces as an instance admin: #1953

### Credits

Huge thanks to @andrejsshell for helping!

### Features

- restrict members to selected projects: #1933
- **site:** offer a ma
naged instance on pricing: [c4d009f](https://github.com/usekaneo/kaneo/commit/c4d009f2e0e1a1c623233ae2d5220e01813c0188)
- **site:** refresh open-source project management guide for search: [a181173](https://github.com/usekaneo/kaneo/commit/a18117307149a7db2f2b055c8d1a20d344f6e71d)

### Bug Fixes

- **ci:** browser test fixes/optimization: #1941
- **ci:** ci errors for contribution workflow: #1939
- **site:** balance the managed instance card on desktop: [5f07734](https://github.com/usekaneo/kaneo/commit/5f077346675e6bc63740c341b8edcce739f709b8)
- **web:** remove the add task row under board columns: #1931

### Credits

Huge thanks to @andrejsshell, @tinsever, and @randoneering for helping!

### Features

- make cross-column dragged card sortable: #1894
- **i18n:** add zh-TW locale: #1893
- **integrations:** add label-based sync in advanced settings: #1908

### Bug Fixes

- **web:** show the task label editor on narrow screens: #1924
- convert ineligible contributions to draft pull requests: [291da4a](https://github.com/usekaneo/kaneo/commit/291da4a413a5b3a107dae9710860e37cf1822a2e)
- **i18n:** translate the zh-CN strings added since the last sync: #1916
- **ci:** exclude skipped events from eligibility concurrency: #1917

### Credits

Huge thanks to @VictorOnwukwe, @kenny-ish, @ApplesBear-X, @tinsever, and @FunnyQ for helping!

### Features

- **web:** redesign settings: #1905
- **site:** link community projects from resources: [69ba99d](https://github.com/usekaneo/kaneo/commit/69ba99da501627977d57597457d04d23966796da)
- **site:** add a community projects page: [961c309](https://github.com/usekaneo/kaneo/commit/961c309cbf383e07c5f9026ad654b2dc77ade6f2)
- **site:** sync product preview with home, inbox and my tasks: [30ba825](https://github.com/usekaneo/kaneo/commit/30ba82531a0d60a0679fbf8bbbe5703cf915059f)
- missing french translation: #1903

### Credits

Huge thanks to @tinsever and @MonsPropre for helping!

### Features

- add short task links like /acme/task/KAN-
12: #1891
- **web:** add home, inbox and my tasks pages: #1898
- **web:** wire the task copy shortcuts: #1897
- **web:** move task delete into the action group: #1896

### Credits

Huge thanks to @andrejsshell and @tinsever for helping!

### Bug Fixes

- **web:** send subscription revenue as a property: [445b735](https://github.com/usekaneo/kaneo/commit/445b735188ea01c832ec1406a03c5ec50edd9b60)

### Features

- **site:** add guides and retarget alternatives: [58f6d47](https://github.com/usekaneo/kaneo/commit/58f6d47939bc95e2ae9e8b42442647ea03f30844)
- **web:** track the cloud signup funnel: [abacad7](https://github.com/usekaneo/kaneo/commit/abacad71bee5e0ab5f4ba1420bde536683533075)
- **docker:** support file-backed secrets for container deployments: #1853
- sort labels alphabetically: #1856
- **web:** select task ranges with shift-click: #1838

### Bug Fixes

- **site:** list GitLab with the git integrations: [3c01517](https://github.com/usekaneo/kaneo/commit/3c01517c0c2396394ac35c7b29802f7f31719840)
- **site:** serve favicon.ico: [e7ef050](https://github.com/usekaneo/kaneo/commit/e7ef0505e36eeaff3a8854f35e489847fa3fabe5)
- **docs:** load the docs font from its real path: [22c7a02](https://github.com/usekaneo/kaneo/commit/22c7a02186ced4899b4b7cb267030b5fc25a0b53)
- **tasks:** make bulk status changes atomic: #1873
- **integrations:** preserve rapid legitimate edits: #1874
- **integrations:** enforce current task ownership: #1867
- **ws:** revoke removed workspace members: #1865
- **migrations:** record workflow migration completion: #1872
- **auth:** enforce api key quotas and rate limits: #1869
- **mcp:** share tools and support workspace label deletion: #1871
- **reminders:** persist notification and claim atomically: #1870
- **integrations:** require task update permission for imports: #1868
- **gitea:** reject saved tokens for changed servers: #1866

### Documentation

- update sponsors: [1c51887](https://github.com/usekaneo/kaneo/commit/1c51887af53369df508c7dc4
dbb7713788a9bd89)

### Credits

Huge thanks to @tuttucodes, @druwan, and @tinsever for helping!

### Features

- clickable task PR list, task link matching, and reopen completed tasks for new work: #1864
- **mcp:** get tasks by ticket ID: #1839

### Bug Fixes

- **ci:** publish npm provenance on GitHub-hosted runners: [50779a4](https://github.com/usekaneo/kaneo/commit/50779a4e21159ad322dc4dd18fa7f1689bee64fa)
- **ci:** pass the GitHub token to AgentScan: #1862
- **ci:** resolve nightly warnings and errors: #1858
- **api:** make legacy MCP HTTP requests replica independent: #1850
- **docker:** disable wget proxy for loopback health checks: #1841

### Documentation

- add AI Policy badge to README: [011c8ee](https://github.com/usekaneo/kaneo/commit/011c8ee731cc684644d8bf568f4a5f74e194878c)
- update sponsors: [e45c8ac](https://github.com/usekaneo/kaneo/commit/e45c8aceed5da9bcc040a592be9677c79133aecd)

### Credits

Huge thanks to @andrejsshell, @tinsever, @randoneering, and @mazzz1y for helping!

### Features

- **web:** guide cloud users through invites and plan choice during onboarding: #1840
- rank new issue priority with Jev: [594e016](https://github.com/usekaneo/kaneo/commit/594e0168dbf586b09d1b0a946e5da9148485b76c)

### Documentation

- assign issue types from templates: [4725cfa](https://github.com/usekaneo/kaneo/commit/4725cfaaabc07a3bf9557de9c0a219cffa980ff5)
- simplify issue and pull request templates: [cb6ce20](https://github.com/usekaneo/kaneo/commit/cb6ce20252ac018c2b6d4e3df9e66b478da3a58d)
- adopt Human Voice AI contribution policy: [b090123](https://github.com/usekaneo/kaneo/commit/b0901239925c0b633d29adf73de45d95c3fa3b6f)
- overhaul agents.md: [4d619aa](https://github.com/usekaneo/kaneo/commit/4d619aa7658ed3388b459534c8a5db7bd9e7b365)

### Credits

Huge thanks to @andrejsshell and @tinsever for helping!

### Bug Fixes

- **billing:** resize Creem seats by subscription item id: #1836
- **gitea:** prevent outbound comment echoes: #1834

### Documentation


- **readme:** highlight cloud and current features: #1831

### Credits

Huge thanks to @andrejsshell and @tinsever for helping!

### Features

- **web:** cloud sign-up and onboarding layout: #1832

### Bug Fixes

- **deps:** migrate Sentry SDKs together to v11 (#1826): #1826
- **ci:** grant nightly reusable CI scan permission: [0216067](https://github.com/usekaneo/kaneo/commit/0216067e37f5de9f8a10c85e05861056009628f3)
- **board:** allow column moves while sorting by task number: #1816

### Documentation

- update contributors and sponsors: [c200d70](https://github.com/usekaneo/kaneo/commit/c200d70672b3a87b6b2e4bdcd43060198324fb7f)
- rebuild guides around current Kaneo workflows: #1814

### Credits

Huge thanks to @tinsever and @andrejsshell for helping!

### Bug Fixes

- **auth:** backfill instance admin on legacy installations: [b7c6aee](https://github.com/usekaneo/kaneo/commit/b7c6aee31ba1174583da5f7fa0aad48257cfc356)

### Credits

Huge thanks to @tinsever for helping!

### Bug Fixes

- **admin:** harden the user administration panel: #1805

### Documentation

- acknowledge BrowserStack testing: [e389a68](https://github.com/usekaneo/kaneo/commit/e389a688c8323cdf6a4eadda127f94f6339e985d)

### Credits

Huge thanks to @andrejsshell for helping!

### Bug Fixes

- **admin:** allow updating your own email without changing role: [3d57439](https://github.com/usekaneo/kaneo/commit/3d57439d59c7e66aa9b63ec673a5b5f7b23008f6)

### Features

- gitlab integration: #1727
- **tasks:** show subtask progress on cards and list rows: #1703
- added project backgrounds: #1654
- multiselect for customfield: #1735
- **ci:** discord actions webhook: #1792
- **ci:** adding zizmor: #1790
- **project:** move a project to another workspace: #1525
- duplicate a task from the card context menu: #1609
- allow manual external resource links: #1661
- **ci:** trufflehog implementation: #1787
- **task:** let images be resized in the task description: #1529
- **web:** add a change-password screen unde
r account settings: #1719
- **auth:** add password recovery from the login screen: #1773
- add instance user administration panel: #1400
- **calendar:** add label-filtered project calendar feeds: #1763

### Bug Fixes

- **security:** close permission and integration gaps: #1802
- **project:** secure integrations across workspace moves: #1801
- **editor:** preserve formatting when pasting Markdown: #1797
- **auth:** report invitation email delivery failures: #1798
- **gitea:** verify saved repository connections: #1796
- **mcp:** keep OAuth requests valid outside UTC: #1795
- **i18n:** translate calendar in remaining locales: [1d61ceb](https://github.com/usekaneo/kaneo/commit/1d61ceb64537a30839039dd8c0a26866d6df1a70)
- **ci:** zizmor findings: #1791
- **integrations:** resolve PRs through linked issue identities: #1739
- **auth:** prevent repeated 401s for pending invitations after session expiry: #1715
- **auth:** gate sign-in emails to deliverable addresses: #1758
- **web:** preserve image uploads across editor recreation: #1738
- **reminders:** calculate deadlines from the end of the due day: #1762
- **mcp:** support whoami with API keys: #1748
- **web:** respect DISABLE_WORKSPACE_CREATION on the onboarding screen: #1744
- **backlog:** prevent task remounts during list interactions: #1734
- **auth:** prevent role changes from removing the last admin: #1733
- **npm:** fixing GHSA-2xp9-vwfh-vxw4: #1777
- **web:** guard tiptap setHardBreak against invalid-content schema error: [be3ffb5](https://github.com/usekaneo/kaneo/commit/be3ffb513a210c81ce10ea1332381de2bf27a475)
- **i18n:** prevent locale module crash on stale dynamic import: #1775
- **site:** improve search metadata and product discovery: [121183e](https://github.com/usekaneo/kaneo/commit/121183e93eb82d3372ccf1419a5fd59d4aacadba)

### Performance Improvements

- **project:** stop returning tasks with project details: #1800

### Documentation

- update contributors and sponsors: [fa07f10](https://github.com/use
kaneo/kaneo/commit/fa07f10ea15a37a6fd414ce45a457e1cf9b7a6a9)
- **site:** add Blacksmith partner badge to site and README: [08a93b8](https://github.com/usekaneo/kaneo/commit/08a93b8c47fa5fa48517c010c099c8f729d865dc)
- update contributors and sponsors: [8432a45](https://github.com/usekaneo/kaneo/commit/8432a453ae5965e4bdbc1b874e82d974324fd494)

### Credits

Huge thanks to @tinsever, @zaralX, @TymekV, @MonsPropre, @randoneering, @rdlugs, @tbringuier, @mohiuddin000, @shiminshen, @yavilavi, @thejdubb02, @yigit-serin, @OmG3r, and @zerodarkzone for helping!

### Features

- **site:** bring product preview up to date with current app: [dd855f7](https://github.com/usekaneo/kaneo/commit/dd855f775b28842f6441936491b28c8ebb52d615)
- **site:** refresh marketing site and interactive product previews: [90aec99](https://github.com/usekaneo/kaneo/commit/90aec997d45bde4479e4d82c0a6a271a95c4bef4)

### Bug Fixes

- **web:** allow non-root runtime configuration writes: #1767
- **site:** poof away preview cursor on interaction: [08dcaee](https://github.com/usekaneo/kaneo/commit/08dcaee01a97b800d8a45c43f8c2158cc091497c)
- **nginx:** allow larger OAuth session headers: #1761
- **deps:** resolve open dependabot advisories: [b8432a0](https://github.com/usekaneo/kaneo/commit/b8432a060011bf1d740cf07e6481d67c5aab64a4)
- **web:** preserve comment markdown spacing: #1521

### Documentation

- **site:** refresh press kit with product screenshots: [3470b0a](https://github.com/usekaneo/kaneo/commit/3470b0af2fb79d8c4705ee28638032d176893e7d)
- update blog comparisons for current Kaneo features: [b97bf7d](https://github.com/usekaneo/kaneo/commit/b97bf7df05a6403f0bfedb224fb1c1ecdc119c00)

### Credits

Huge thanks to @tinsever for helping!

### Features

- add maintainer-triggered Peekareview code reviews: [65bb146](https://github.com/usekaneo/kaneo/commit/65bb146c74f5c5118e7a54951c1584ec065f0960)
- **peekareq:** add budgeted private code-review evaluation: [a8151a8](https://github.com/usekaneo/kaneo/comm
it/a8151a8d6c51af1227095482c1d5297db5f5ffbb)

### Bug Fixes

- require AUTH_SECRET and gate project visibility changes: [156b72b](https://github.com/usekaneo/kaneo/commit/156b72b3b66415bffee6732788631bdcb11781f3)
- enforce security boundaries and bound integration workloads: [71bd198](https://github.com/usekaneo/kaneo/commit/71bd1983a77f5e5a13bcc1b483894f6b8523dbb5)
- handle review relay redirects and explicit reruns: [a6ea057](https://github.com/usekaneo/kaneo/commit/a6ea05715d5eedaded5c1ee94ea715e093a97a21)
- **web:** use HttpError across fetchers: #1751
- **web:** prevent 404 on activity query when taskId is undefined: #1750

### Reverts

- remove Peekareq code-review experiment: [4169b98](https://github.com/usekaneo/kaneo/commit/4169b98f4f9f273a0ba524b5fd058d0a235ea22a)

### Documentation

- update contributors and sponsors: [0982593](https://github.com/usekaneo/kaneo/commit/0982593b8206622c6f7e9bf774d39207bcf002b9)
- update contributors and sponsors: [f94a27e](https://github.com/usekaneo/kaneo/commit/f94a27e63019e98481de616ef95f039d84b3ec96)

### Credits

Huge thanks to @randoneering for helping!

### Features

- add focused Peekareq previews and accessibility findings: [6e01c0f](https://github.com/usekaneo/kaneo/commit/6e01c0f0d579c1a5fc3b602206e95f2478232ca8)
- **ci:** add maintainer-triggered Peekareq screenshots: [2d8a4c6](https://github.com/usekaneo/kaneo/commit/2d8a4c6fe5727a96a550380995aa5bb57775b669)

### Bug Fixes

- **billing:** keep cancelled subscriptions entitled until the paid period ends: #1741
- fall back when Peekareq's model provider is throttled: [145c13a](https://github.com/usekaneo/kaneo/commit/145c13a11bd508659ee6396a95058cf468845ef5)
- ground Peekareq custom-field screenshots in fixtures: [4b684e7](https://github.com/usekaneo/kaneo/commit/4b684e79441055a12a79579443551ecf8a19fa84)
- **ci:** use Cloudflare-compatible GitHub requests: [9740bf8](https://github.com/usekaneo/kaneo/commit/9740bf8402d79b806e9115180aca7b5e3354f9a5)
- **ci:** filte
r Peekareq commands with a Cloudflare webhook: [34ee59e](https://github.com/usekaneo/kaneo/commit/34ee59e12343b80ab6beae94ba06c36e0f7cc813)

### Documentation

- update contributors and sponsors: [508bd4b](https://github.com/usekaneo/kaneo/commit/508bd4b89ade880527e01408aaec332102cafa4b)
- update contributors and sponsors: [a750d01](https://github.com/usekaneo/kaneo/commit/a750d01a2f420992d5321918c9f57750f3326e01)
- update contributors and sponsors: [16fcd5f](https://github.com/usekaneo/kaneo/commit/16fcd5fc5103ec3ce7187dcb780ef5ac360e1375)
- update contributors and sponsors: [93cb471](https://github.com/usekaneo/kaneo/commit/93cb4712367e5cbb7ac6f9c5ec20e6a037c227bc)

### Credits

Huge thanks to @andrejsshell for helping!

### Features

- custom fields configuration: #1542
- redirect to default project: #1640
- **i18n:** add Azerbaijani (az-AZ) translation: #1704

### Bug Fixes

- **web:** defer Shiki highlighter loading on task page: #1713
- **i18n:** restore Simplified Chinese translations for Mattermost integration: #1701
- **i18n:** sync Mattermost keys across locales: #1710
- **npm:** fixing CVE-2026-75604: #1709
- **api:** skip archived tasks in due date reminders: #1702

### Documentation

- update contributors and sponsors: [d7f1c46](https://github.com/usekaneo/kaneo/commit/d7f1c4664d55bdea1f3b9e27d1f26607a053c00e)
- update contributors and sponsors: [243f9d8](https://github.com/usekaneo/kaneo/commit/243f9d8e16793d2bbc3d22d66ba53bc21eed0867)
- update contributors and sponsors: [41b72df](https://github.com/usekaneo/kaneo/commit/41b72df7cdfefd89f0adf643f249aa3ad6ea28d8)

### Credits

Huge thanks to @MonsPropre, @ApplesBear-X, @randoneering, @jamalkamaladdin, and @mmilanovic4 for helping!

### Bug Fixes

- **mcp:** accept refresh_token grant on register: [59314c1](https://github.com/usekaneo/kaneo/commit/59314c15aded93fe65170eb7ca94d00bc1af5174)

### Documentation

- update contributors and sponsors: [e5a4675](https://github.com/usekaneo/kaneo/commit/e5a4675e7d
49e634de4cef4171e3925666bb6c8c)

### Bug Fixes

- **web:** use location.href for the sign-in redirect param: [7483d37](https://github.com/usekaneo/kaneo/commit/7483d37ea059a76f298cbd66cb3eb9903e0ce44f)

### Features

- **mattermost:** add native Mattermost integration: #1325
- center Gantt view on today by default: #1686
- task item counters: #1638
- **i18n:** add polish locale: #1639
- **i18n:** add Japanese (ja-JP) translation: #1662

### Bug Fixes

- **ci:** preserve OpenAPI checker argument boundaries: #1657
- **web:** preserve imported label colors: #1695
- project nav width in different language: #1641
- make task removal discoverable and calendar states distinct: #1685
- **web:** protect unsaved task input: #1694
- **auth:** prevent 40

... [Content truncated]