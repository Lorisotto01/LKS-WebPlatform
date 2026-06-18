import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/utils/cn";
type ToastType = "success" | "error" | "info";
interface Toast { id: number; type: ToastType; message: string; }
interface ToastApi { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void; }
const Ctx = createContext<ToastApi | null>(null);
const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const styles: Record<ToastType, string> = {
  success: "border-green-600/40 text-green-300", error: "border-destructive/50 text-red-300", info: "border-primary/40 text-primary",
};
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const api: ToastApi = { success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className={cn("flex items-start gap-3 rounded-md border bg-card p-3 shadow-lg", styles[t.type])}>
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-sm text-foreground">{t.message}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within ToastProvider");
  return v;
}
