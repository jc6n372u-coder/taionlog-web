import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import TemperatureMedicationChart, {
  type ViewMode,
} from "../../features/chart/TemperatureMedicationChart";
import {
  onDataRefreshRequested,
  type SyncStoreName,
} from "../../services/sync/syncEvents";
import type { EventRow, Medication, RecordRow, User } from "../../utils/types";
import { extractMedId, extractMedNameFromPayload } from "../../utils/payload";
import { COLORS } from "../tokens";

const CHART_REFRESH_STORES = new Set<SyncStoreName>([
  "groups",
  "users",
  "records",
  "medications",
  "events",
]);

function includesChartRefreshStore(stores: readonly SyncStoreName[]): boolean {
  return stores.some((store) => CHART_REFRESH_STORES.has(store));
}

export default function ChartPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [selUser, setSelUser] = useState("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [meds, setMeds] = useState<EventRow[]>([]);
  const [medMaster, setMedMaster] = useState<Medication[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [referenceTime, setReferenceTime] = useState(0);

  const mountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const selectedUserRef = useRef("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadChartData = useCallback(
    async (preferredUserId?: string) => {
      const requestId = ++loadRequestIdRef.current;
      const group = await LocalDb.getCurrentGroup();

      if (!group) {
        if (mountedRef.current && requestId === loadRequestIdRef.current) {
          nav("/");
        }
        return;
      }

      const [nextUsers, nextMedMaster] = await Promise.all([
        LocalDb.listUsers(group.group_id),
        LocalDb.getMedications(group.group_id),
      ]);

      const requestedUserId = preferredUserId ?? selectedUserRef.current;
      const nextSelectedUser = nextUsers.some((user) => user.uuid === requestedUserId)
        ? requestedUserId
        : nextUsers[0]?.uuid ?? "";

      const [nextRecords, nextEvents] = nextSelectedUser
        ? await Promise.all([
            LocalDb.listRecords(nextSelectedUser),
            LocalDb.listEvents(nextSelectedUser),
          ])
        : [[], []];

      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

      selectedUserRef.current = nextSelectedUser;
      setUsers(nextUsers);
      setSelUser(nextSelectedUser);
      setRecords(nextRecords);
      setMeds(nextEvents.filter((event) => event.event_type === "medication"));
      setMedMaster(nextMedMaster);
      setReferenceTime(Date.now());
    },
    [nav]
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadChartData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadChartData]);

  useEffect(() => {
    return onDataRefreshRequested(({ stores }) => {
      if (!includesChartRefreshStore(stores)) return;
      void loadChartData(selectedUserRef.current);
    });
  }, [loadChartData]);

  const handleSelectUser = useCallback(
    (userId: string) => {
      if (userId === selectedUserRef.current) return;
      selectedUserRef.current = userId;
      setSelUser(userId);
      setRecords([]);
      setMeds([]);
      void loadChartData(userId);
    },
    [loadChartData]
  );

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setReferenceTime(Date.now());
  }, []);

  const windowDays = useMemo(() => {
    switch (viewMode) {
      case "day":
        return 1;
      case "week":
        return 7;
      case "month":
        return 30;
      case "year":
        return 365;
    }
  }, [viewMode]);

  const getMedName = useCallback(
    (event: EventRow) => {
      const medId = extractMedId(event);
      if (medId) {
        const found = medMaster.find((medication) => medication.uuid === medId);
        if (found) return found.name;
      }

      const fallbackName = extractMedNameFromPayload(event.payload);
      return fallbackName ?? "不明なお薬";
    },
    [medMaster]
  );

  const chartData = useMemo(() => {
    const windowMs = windowDays * 24 * 60 * 60 * 1000;

    const tempPoints = records
      .filter((record) => referenceTime - new Date(record.measured_at).getTime() < windowMs)
      .filter((record) => record.temp > 30.0)
      .map((record) => ({
        time: new Date(record.measured_at).getTime(),
        value: record.temp,
      }));

    const medPoints = meds
      .filter((event) => referenceTime - new Date(event.occurred_at).getTime() < windowMs)
      .map((event) => {
        const medTime = new Date(event.occurred_at).getTime();
        const nearTemp = tempPoints.find(
          (temperature) => Math.abs(temperature.time - medTime) < 60 * 60 * 1000
        );
        const plotValue = nearTemp ? nearTemp.value + 0.3 : 37.0;

        return {
          time: medTime,
          name: getMedName(event),
          value: plotValue,
        };
      });

    return { tempPoints, medPoints };
  }, [getMedName, meds, records, referenceTime, windowDays]);

  const combinedList = useMemo(() => {
    const windowMs = windowDays * 24 * 60 * 60 * 1000;

    const map = new Map<
      string,
      {
        date: string;
        temp?: number;
        medNames: string[];
        memo?: string;
        id: string;
        type: "temp" | "med";
      }
    >();

    records.forEach((record) => {
      if (referenceTime - new Date(record.measured_at).getTime() >= windowMs) return;
      const key = record.measured_at;
      map.set(key, {
        date: record.measured_at,
        temp: record.temp > 0 ? record.temp : undefined,
        memo: record.memo ?? undefined,
        medNames: [],
        id: record.uuid,
        type: "temp",
      });
    });

    meds.forEach((event) => {
      if (referenceTime - new Date(event.occurred_at).getTime() >= windowMs) return;
      const key = event.occurred_at;
      const name = getMedName(event);

      const existing = map.get(key);
      if (existing) {
        existing.medNames.push(name);
      } else {
        map.set(key, {
          date: event.occurred_at,
          medNames: [name],
          id: event.uuid,
          type: "med",
        });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [getMedName, meds, records, referenceTime, windowDays]);

  const goEdit = (item: { id: string; type: string }) => {
    nav(`/input?userId=${selUser}&editId=${item.id}&type=${item.type}`);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: COLORS.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          height: 56,
          background: COLORS.primary,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          color: "white",
        }}
      >
        <button
          onClick={() => nav("/")}
          style={{
            border: "none",
            background: "transparent",
            color: "white",
            fontSize: 20,
            width: 40,
          }}
        >
          ←
        </button>
        <span style={{ fontWeight: "bold", fontSize: 16 }}>グラフ</span>
      </header>

      <div
        style={{
          background: COLORS.surface,
          padding: "12px 16px",
          overflowX: "auto",
          display: "flex",
          gap: 8,
          borderBottom: `1px solid ${COLORS.borderLight}`,
        }}
      >
        {users.map((user) => (
          <button
            key={user.uuid}
            onClick={() => handleSelectUser(user.uuid)}
            style={selUser === user.uuid ? styles.tabActive : styles.tab}
          >
            {user.name}
          </button>
        ))}
      </div>

      <div style={{ padding: 16, background: COLORS.surface, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={styles.segmentControl}>
            {(["day", "week", "month", "year"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleViewModeChange(mode)}
                style={viewMode === mode ? styles.segmentBtnActive : styles.segmentBtn}
              >
                {{ day: "日", week: "週", month: "月", year: "年" }[mode]}
              </button>
            ))}
          </div>
        </div>

        <TemperatureMedicationChart
          temperatures={chartData.tempPoints}
          medications={chartData.medPoints}
          viewMode={viewMode}
        />
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
        <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 12 }}>
          履歴 (
          {viewMode === "day"
            ? "24時間"
            : viewMode === "week"
              ? "1週間"
              : viewMode === "month"
                ? "1ヶ月"
                : "1年"}
          )
        </h3>
        {combinedList.length === 0 && (
          <div style={{ textAlign: "center", color: "#ccc", padding: 20 }}>
            記録がありません
          </div>
        )}

        {combinedList.map((item) => {
          const hasTemp = item.temp !== undefined;
          const isFever = hasTemp && item.temp! >= 37.5;

          let leftColor: string = COLORS.text;
          if (hasTemp) {
            leftColor = isFever ? COLORS.fever : COLORS.primary;
          } else {
            leftColor = COLORS.medication;
          }

          return (
            <div
              key={item.id}
              onClick={() => goEdit(item)}
              style={{
                background: COLORS.surface,
                padding: 12,
                borderRadius: 8,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 16,
                cursor: "pointer",
              }}
            >
              <div style={{ minWidth: 80, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: "bold", color: leftColor }}>
                  {hasTemp ? `${item.temp!.toFixed(1)}℃` : "💊"}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  borderLeft: `1px solid ${COLORS.borderLight}`,
                  paddingLeft: 12,
                }}
              >
                <div style={{ fontSize: 12, color: COLORS.textSubtle, marginBottom: 4 }}>
                  {new Date(item.date).toLocaleDateString()} {new Date(item.date).getHours()}:
                  {new Date(item.date).getMinutes().toString().padStart(2, "0")}
                </div>

                {item.medNames.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                    {item.medNames.map((name, index) => (
                      <span
                        key={`${item.id}-${index}`}
                        style={{
                          fontSize: 12,
                          background: "#FFF3E0",
                          color: "#E65100",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontWeight: "bold",
                        }}
                      >
                        💊 {name}
                      </span>
                    ))}
                  </div>
                )}

                {item.memo && (
                  <div
                    style={{
                      fontSize: 14,
                      color: COLORS.text,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {item.memo}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tab: {
    padding: "6px 16px",
    borderRadius: 20,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  tabActive: {
    padding: "6px 16px",
    borderRadius: 20,
    border: `1px solid ${COLORS.primary}`,
    background: COLORS.primarySoft,
    color: "#0e7490",
    fontWeight: "bold",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  segmentControl: {
    display: "flex",
    background: COLORS.bg,
    borderRadius: 8,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    padding: "6px 16px",
    border: "none",
    background: "transparent",
    color: COLORS.textMuted,
    cursor: "pointer",
    borderRadius: 6,
    fontSize: 13,
  },
  segmentBtnActive: {
    flex: 1,
    padding: "6px 16px",
    border: "none",
    background: COLORS.surface,
    color: COLORS.primary,
    fontWeight: "bold",
    cursor: "pointer",
    borderRadius: 6,
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
    fontSize: 13,
  },
};
