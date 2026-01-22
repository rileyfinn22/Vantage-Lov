
Clear all stored agents, to reset and regenerate the prompt for elevenlabs.
```postgresql
update flags set agent_id = null where agent_id is not null;
```