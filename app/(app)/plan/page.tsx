"use client";

import { useState } from "react";
import MealListSection from "@/components/plan/MealListSection";
import NutritionApproachToggle from "@/components/plan/NutritionApproachToggle";
import type { NutritionApproach } from "@/types/plan";

export default function PlanPage() {
  const [nutritionApproach, setNutritionApproach] =
    useState<NutritionApproach>("orange_base");
  const [breakfasts, setBreakfasts] = useState(["", ""]);
  const [lunches, setLunches] = useState(["", ""]);
  const [triggerSnacks, setTriggerSnacks] = useState(["", ""]);
  const [desserts, setDesserts] = useState([""]);

  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-10 md:px-10">
      <div>
        <h1 className="font-heading text-2xl uppercase tracking-wide text-foreground">
          Weekly Base Plan
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted">
          Plan your breakfasts, lunches, snacks, and desserts for the week.
        </p>
      </div>

      <NutritionApproachToggle
        value={nutritionApproach}
        onChange={setNutritionApproach}
      />

      <MealListSection
        title="Breakfast"
        idPrefix="breakfast"
        values={breakfasts}
        onChange={setBreakfasts}
        minRequired={2}
        maxItems={3}
        placeholder="e.g. Greek yogurt with berries"
      />

      <MealListSection
        title="Lunch"
        idPrefix="lunch"
        values={lunches}
        onChange={setLunches}
        minRequired={2}
        maxItems={3}
        placeholder="e.g. Grilled chicken salad"
      />

      <MealListSection
        title="Trigger Snack"
        idPrefix="trigger-snack"
        values={triggerSnacks}
        onChange={setTriggerSnacks}
        minRequired={2}
        maxItems={3}
        placeholder="e.g. Apple with almond butter"
      />

      <MealListSection
        title="Dessert"
        idPrefix="dessert"
        values={desserts}
        onChange={setDesserts}
        minRequired={1}
        maxItems={2}
        placeholder="e.g. Dark chocolate square"
      />
    </div>
  );
}
