import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-[15px] leading-[22px] font-semibold">Caudal</h1>
      <p className="num text-[32px] leading-9 font-semibold tracking-[-0.02em]">
        {formatMoney(12480.5)}
      </p>
      <Button>Empezar</Button>
    </main>
  );
}
