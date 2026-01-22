ALTER TABLE "battle_cards" ADD CONSTRAINT "battle_cards_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;
