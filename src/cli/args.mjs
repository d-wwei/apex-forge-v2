export function parseArgs(items) {
  const args = {};
  const positionals = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item == null) continue;
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = items[index + 1];
      if (next == null || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        index += 1;
      }
    } else positionals.push(item);
  }
  args._ = positionals;
  return args;
}
