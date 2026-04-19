import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, Trash2, DollarSign, AlertTriangle, Calendar, Wrench, ShieldAlert, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Bell> = {
  payment_received: DollarSign,
  invoice_overdue: AlertTriangle,
  booking_expiring: Calendar,
  maintenance_due: Wrench,
  insurance_expiring: ShieldAlert,
  reminder_sent: Mail,
  general: Bell,
};

export function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeOne } = useNotifications();

  const handleClick = (n: Notification) => {
    if (!n.read_at) markAsRead(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center rounded-full"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Notificaciones</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {unreadCount} sin leer
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllAsRead()}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Marcar todo
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No tienes notificaciones
          </div>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="divide-y">
              {notifications.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "group p-3 hover:bg-muted/50 cursor-pointer transition-colors flex gap-3",
                      isUnread && "bg-primary/5"
                    )}
                    onClick={() => handleClick(n)}
                  >
                    <div className={cn("mt-0.5 p-1.5 rounded-md", isUnread ? "bg-primary/10" : "bg-muted")}>
                      <Icon className={cn("h-4 w-4", isUnread ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm leading-tight", isUnread && "font-semibold")}>
                          {n.title}
                        </p>
                        {isUnread && <div className="h-2 w-2 rounded-full bg-primary mt-1 flex-shrink-0" />}
                      </div>
                      {n.message && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isUnread && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(n.id);
                              }}
                              aria-label="Marcar como leído"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeOne(n.id);
                            }}
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
