import styles from "./page.module.css";



export default function Footer() {
  

  return (
    <footer className={styles.footer}>
      

      <div className={styles.copyRight}>
        &copy; {new Date().getFullYear()} Paayh by East Sixties Limited. All Rights Reserved.
      </div>
    </footer>
  );
}
