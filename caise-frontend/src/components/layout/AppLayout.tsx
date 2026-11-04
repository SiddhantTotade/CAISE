import { Outlet, useOutletContext } from "react-router-dom";
import { useState } from "react";
import { useChats } from "../../hooks/useChats";
import { useRepos } from "../../hooks/useRepos";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export type AppContext = ReturnType<typeof useRepos> & { query: string; chatList: ReturnType<typeof useChats> };

/** Authenticated shell. Repos and chats are loaded once here and shared with every page via outlet context. */
export function AppLayout() {
  const reposState = useRepos();
  const chatList = useChats();
  const [query, setQuery] = useState("");

  return (
    <div className="flex h-full">
      <Sidebar repos={reposState.repos} chatList={chatList} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar query={query} onSearch={setQuery} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet context={{ ...reposState, query, chatList } satisfies AppContext} />
        </main>
        <MobileNav />
      </div>
    </div>
  );
}

export const useAppContext = (): AppContext => useOutletContext<AppContext>();
