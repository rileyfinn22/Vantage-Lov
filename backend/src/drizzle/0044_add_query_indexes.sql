CREATE INDEX IF NOT EXISTS interactions_salesperson_status_idx
  ON interactions(salesperson_id, processed_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS flags_salesperson_complete_idx
  ON flags(associated_salesperson_id, complete);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS interaction_objections_agg_idx
  ON interaction_objections(objection_id, was_overcome, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS interaction_pain_points_agg_idx
  ON interaction_pain_points(pain_point_id, was_resolved, created_at);
