import { BrowserRouter, Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { CreatePage, ChartCreatePage, MapCreatePage } from "../pages/CreatePage";
import { HomePage } from "../pages/HomePage";
import { InquiryPage } from "../pages/InquiryPage";
import { StatusPage } from "../pages/StatusPage";

const navItems = [
  { to: "/create", label: "자료 제작" },
  { to: "/inquiry", label: "자료 탐구" },
  { to: "/status", label: "API 상태" },
];

export function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar">
          <Link className="brand" to="/"><span className="brand-mark">G</span><span>GeoLab <em>Classroom</em></span></Link>
          <nav className="topnav" aria-label="주요 메뉴">{navItems.map((item) => <NavLink className={({ isActive }) => isActive ? "is-active" : ""} to={item.to} key={item.to}>{item.label}</NavLink>)}</nav>
          <Link className="topbar-status" to="/status"><span className="status-dot status-dot--green" />Phase 0 <span>↗</span></Link>
        </header>
        <main className="main-content"><Routes><Route path="/" element={<HomePage />} /><Route path="/create" element={<CreatePage />} /><Route path="/create/2d" element={<Navigate to="/create/2d/domestic" replace />} /><Route path="/create/2d/domestic" element={<MapCreatePage dimension="2D" scope="domestic" />} /><Route path="/create/2d/world" element={<MapCreatePage dimension="2D" scope="world" />} /><Route path="/create/3d" element={<MapCreatePage dimension="3D" />} /><Route path="/create/chart" element={<ChartCreatePage />} /><Route path="/inquiry" element={<InquiryPage />} /><Route path="/inquiry/2d/:activityId" element={<InquiryPage />} /><Route path="/inquiry/3d/:activityId" element={<InquiryPage />} /><Route path="/inquiry/chart/:activityId" element={<InquiryPage />} /><Route path="/status" element={<StatusPage />} /><Route path="*" element={<NotFound />} /></Routes></main>
        <footer className="footer"><span>GeoLab Classroom · data-informed geography learning</span><span>React / Vite / Supabase-ready</span></footer>
      </div>
    </BrowserRouter>
  );
}

function NotFound() {
  return <section className="empty-state"><p className="eyebrow">404</p><h1>페이지를 찾을 수 없습니다.</h1><Link className="button button-primary" to="/">홈으로 돌아가기</Link></section>;
}
