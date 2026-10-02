import { Map } from "lucide-react";

export default function PlannerPage() {
  return (
    <div className="h-full overflow-y-auto p-8 pb-[100px] md:pb-8 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/20 text-foreground flex items-center justify-center mb-4">
        <Map size={28} />
      </div>
      <h1 className="text-2xl font-bold mb-2">Date Planner</h1>
      <p className="text-muted-foreground max-w-sm">
        Coming soon — plan date ideas and trips together. For now, add plans in the Calendar.
      </p>
    </div>
  );
}
