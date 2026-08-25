export function printHelp() {
  console.log(`Apex Forge V2 项目级内核原型

用法：
  apex-v2 init --project <dir> [--name <name>]
  apex-v2 status --project <dir>
  apex-v2 validate --project <dir>
  apex-v2 intake add|list|triage --project <dir>
  apex-v2 intake import-spec --project <dir> --format native|openspec|spec-kit|auto --path <file-or-dir>
  apex-v2 capability list|show|route|verify
  apex-v2 roadmap promote --project <dir> --intake-id <id>
  apex-v2 run create|show|plan|carry|node --project <dir>
  apex-v2 artifact submit|list --project <dir>
  apex-v2 knowledge refresh --project <dir>
  apex-v2 worker create|list|sandbox|exec-shell|exec-agent|retry|fallback|results|resume|decide|submit-patch --project <dir>
  apex-v2 worker adapters --project <dir>
  apex-v2 host actions|claim|submit|cancel --project <dir> --host-id <id>
    host submit accepts --semantic-evidence-json|--semantic-evidence-file and
    --capability-evidence-json|--capability-evidence-file
  apex-v2 decision list|show|propose --project <dir>
  apex-v2 negative-control show|record-red|record-green|restore --project <dir>
  apex-v2 merge enqueue|status|resolve|apply --project <dir>
  apex-v2 verify run --project <dir> --run-id <id>
  apex-v2 review generate --project <dir> --run-id <id>
  apex-v2 learn propose|list|approve|apply --project <dir>
  apex-v2 project tick --project <dir>
    --run-agents [--agent-limit <n>] [--agent-cycles <n>]
    --learning-worker [--learning-limit <n>]
  apex-v2 project reconcile --project <dir>
  apex-v2 project metrics|quality|audit --project <dir>
  apex-v2 project git discover|guard|claim|release|claim-status --project <dir>
  apex-v2 project heartbeat --project <dir> [--force-notifications]
  apex-v2 project heartbeat install|status|daemon-start|daemon-status|daemon-stop --project <dir>
  apex-v2 contracts validate --project <dir>
  apex-v2 contracts migrate --project <dir>
  apex-v2 approval list|decide --project <dir>
  apex-v2 risk list|add|update --project <dir>
  apex-v2 notification list --project <dir>
  apex-v2 notification dispatch|acknowledge --project <dir>
`);
}
