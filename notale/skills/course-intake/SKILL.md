---
name: course-intake
description: Convert a lecture request and optional source material into a precise course brief without silently discarding context.
required_tools: [skill_read, artifact_read, submit_course_brief]
---

# Course intake

1. Inspect the complete query and material index. Use `artifact_read` for long material instead of assuming the prompt excerpt is complete.
2. Resolve topic, audience, prior knowledge, duration, requested page count, intensity, language, and explicit interaction requirements. Never reinterpret an explicit `N页` as `N` minutes; if duration is absent, use 45 minutes.
3. Record assumptions explicitly in the relevant text field; never invent uploaded content.
4. Call `submit_course_brief` as soon as the brief validates. Harness events maintain the task ledger;
   a prose answer is not a submission.
