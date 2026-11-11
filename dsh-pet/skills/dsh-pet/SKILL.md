---
name: dsh-pet
description: Control the user's local dsh-pet companion. Use when they want to inspect its state, ask it to say or generate something, play an animation, sleep/wake it, or manage its todo list.
---

# dsh-pet

Use the `dsh-pet` MCP tools for pet actions. Do not pretend the pet said something unless a tool returned that text.

- `pet_status`: inspect current status and available pets.
- `pet_say`: display exact user-provided text; enable `speak` only when requested.
- `pet_whisper`: let the pet generate an in-character line using its configured model.
- `pet_play`: play a configured animation by its exact configured name.
- `pet_sleep`: sleep or wake a pet.
- `pet_chat`: send a message and get the pet's configured-model reply.
- `pet_balance`: refresh the configured balance provider, or show Codex quota windows observed from local CLI session records when no separate provider is configured.
- `pet_todo`: list, add, complete, edit, or delete items. Pass dueAt as Unix epoch milliseconds and use `pet_todo` first to get todo IDs.
