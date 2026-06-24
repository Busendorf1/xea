// "use client";

// import { useEffect, useState } from "react";
// import supabase from "@/lib/utils/db";
// import styles from "./page.module.css"; // Adjust or create styling as needed

// interface UserProfileData {
//   id: string;
//   email: string;
//   interest: string;
//   industry: string;
//   behavior: string;
//   lifestyle: string;
//   personality: string;
//   country: string;
//   state: string;
//   gender: string;
//   employment: string;
// }

// export default function UserTablePage() {
//   const [userData, setUserData] = useState<UserProfileData | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     const fetchUserData = async () => {
//       setLoading(true);

//       const {
//         data: { session },
//         error: sessionError,
//       } = await supabase.auth.getSession();

//       if (sessionError || !session?.user?.email) {
//         setError("Failed to get session.");
//         setLoading(false);
//         return;
//       }

//       const { data, error } = await supabase
//         .from("users")
//         .select("*")
//         .eq("email", session.user.email)
//         .single();

//       if (error || !data) {
//         setError("Failed to fetch user data.");
//         setLoading(false);
//         return;
//       }

//       setUserData(data);
//       setError(null);
//       setLoading(false);
//     };

//     fetchUserData();
//   }, []);

//   if (loading) return <p className={styles.status}>Loading user data...</p>;
//   if (error) return <p className={styles.status}>{error}</p>;
//   if (!userData) return <p className={styles.status}>No user data found.</p>;

//   return (
//     <div className={styles.tableContainer}>
//       <h1 className={styles.heading}>Your Profile Info</h1>
//       <table className={styles.table}>
//         <tbody>
//           <tr>
//             <th>Email</th>
//             <td>{userData.email}</td>
//           </tr>
//           <tr>
//             <th>Interest</th>
//             <td>{userData.interest}</td>
//           </tr>
//           <tr>
//             <th>Industry</th>
//             <td>{userData.industry}</td>
//           </tr>
//           <tr>
//             <th>Behavior</th>
//             <td>{userData.behavior}</td>
//           </tr>
//           <tr>
//             <th>Lifestyle</th>
//             <td>{userData.lifestyle}</td>
//           </tr>
//           <tr>
//             <th>Personality</th>
//             <td>{userData.personality}</td>
//           </tr>
//           <tr>
//             <th>Country</th>
//             <td>{userData.country}</td>
//           </tr>
//           <tr>
//             <th>State</th>
//             <td>{userData.state}</td>
//           </tr>
//           <tr>
//             <th>Gender</th>
//             <td>{userData.gender}</td>
//           </tr>
//           <tr>
//             <th>Employment</th>
//             <td>{userData.employment}</td>
//           </tr>
//         </tbody>
//       </table>
//     </div>
//   );
// }



import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import Update from "@/components/Update/page";

export default async function ProfilePage() {
  const session = await auth0.getSession();

  if (!session?.user?.email) {
    redirect("/");
  }

  return <Update email={session.user.email} />;
}

