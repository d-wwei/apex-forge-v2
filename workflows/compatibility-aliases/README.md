# Compatibility Skill Aliases

These templates preserve the five pre-WP8 Skill names for one-release rollback
or migration builds. They are outside the default Skill discovery root.

Build a compatibility package with:

```sh
APEX_PLUGIN_COMPAT_ALIASES=1 npm run build:plugin
```

Run the default build again to restore the single-entry package:

```sh
npm run build:plugin
```
