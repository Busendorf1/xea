import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import AdminDashboardClient from "@/components/AdminDashboardClient/page";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const session = await auth0.getSession();

  if (!session || !session.user) {
    redirect("/");
  }

  const email = session.user.email?.toLowerCase();

  if (!email) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#000",
        color: "#fff",
        fontFamily: "system-ui, sans-serif"
      }}>
        <h2>Access Denied</h2>
        <p>No email address associated with your session.</p>
        <Link href="/" style={{ color: "#3b82f6", marginTop: "1rem" }}>Go back home</Link>
      </div>
    );
  }

  // Define admin emails whitelist (defaulting to the requested ones)
  const defaultAdmins = ["admin@xea.com", "nonsom019@gmail.com", "nonsom2023@gmail.com"];
  const envAdmins = process.env.ADMIN_EMAILS 
    ? process.env.ADMIN_EMAILS.split(",").map(e => e.trim().toLowerCase())
    : [];
  
  const adminEmails = envAdmins.length > 0 ? envAdmins : defaultAdmins;

  const isAdmin = adminEmails.includes(email);

  if (!isAdmin) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#030712",
        color: "#f3f4f6",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "2rem",
        textAlign: "center"
      }}>
        <div style={{
          padding: "2.5rem",
          borderRadius: "16px",
          backgroundColor: "#0f172a",
          border: "1px solid #1e293b",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
          maxWidth: "480px"
        }}>
          <div style={{
            fontSize: "3rem",
            marginBottom: "1rem",
            color: "#ef4444"
          }}>⚠️</div>
          <h1 style={{
            fontSize: "1.75rem",
            fontWeight: "700",
            marginBottom: "0.75rem",
            color: "#f87171"
          }}>Admin Access Required</h1>
          <p style={{
            fontSize: "1rem",
            color: "#9ca3af",
            lineHeight: "1.5",
            marginBottom: "1.5rem"
          }}>
            Your account (<strong>{email}</strong>) is not authorized to access this administration panel. Please log in with an approved administrator account.
          </p>
          <div style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center"
          }}>
            <Link href="/user/dashboard" style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "8px",
              backgroundColor: "#1e293b",
              color: "#fff",
              fontWeight: "500",
              border: "1px solid #334155",
              transition: "all 0.2s"
            }}>
              User Dashboard
            </Link>
            <Link href="/user/logout" style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "8px",
              backgroundColor: "#ef4444",
              color: "#fff",
              fontWeight: "500",
              transition: "all 0.2s"
            }}>
              Log Out
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Pass session and admin emails list to the client view
  return <AdminDashboardClient session={session as any} adminEmails={adminEmails} />;
}
