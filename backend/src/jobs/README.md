# Background Jobs

This directory contains CLI scripts for running background jobs and scheduled tasks.

## Running Jobs

All jobs can be run using pnpm tsx:

```bash
cd backend
pnpm tsx src/jobs/<job-name>.ts [args]
```

## Available Jobs

### aggregate-feedback.ts

Aggregates feedback data (rep ratings, coach notes, bad flag reports) to build company-specific AI training context.

**Usage:**

```bash
# Aggregate for all companies
pnpm tsx src/jobs/aggregate-feedback.ts

# Aggregate for a specific company
pnpm tsx src/jobs/aggregate-feedback.ts 123
```

**Scheduling:**

This job should be run daily or weekly. You can schedule it using:

1. **Cron** (Linux/Mac):
   ```
   # Daily at 2 AM
   0 2 * * * cd /path/to/backend && pnpm tsx src/jobs/aggregate-feedback.ts
   ```

2. **Mise tasks** (Add to mise.toml):
   ```toml
   [tasks.aggregate_feedback]
   description = "Aggregate feedback for AI training"
   run = "cd backend && pnpm tsx src/jobs/aggregate-feedback.ts"
   ```

3. **Docker/Kubernetes CronJob** (Production):
   ```yaml
   apiVersion: batch/v1
   kind: CronJob
   metadata:
     name: aggregate-feedback
   spec:
     schedule: "0 2 * * *"  # Daily at 2 AM
     jobTemplate:
       spec:
         template:
           spec:
             containers:
             - name: aggregate-feedback
               image: your-app-image
               command: ["pnpm", "tsx", "src/jobs/aggregate-feedback.ts"]
   ```

## Adding New Jobs

1. Create a new file in this directory (e.g., `my-job.ts`)
2. Add the shebang: `#!/usr/bin/env tsx`
3. Implement your job logic
4. Export a `main()` function
5. Call `main()` if the file is executed directly
6. Document the job in this README

**Template:**

```typescript
#!/usr/bin/env tsx
/**
 * CLI Job: My Job
 * Description of what this job does
 *
 * Usage:
 *   pnpm tsx src/jobs/my-job.ts [args]
 */

async function main() {
  try {
    console.log("Running my job...");
    // Your job logic here
    console.log("Job completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Job failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
```
