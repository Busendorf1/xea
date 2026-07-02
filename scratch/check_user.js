const { createClient } = require("@supabase/supabase-js");

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/);
  const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.*)/);
  
  const url = urlMatch ? urlMatch[1].trim() : "";
  const key = keyMatch ? keyMatch[1].trim() : "";
  
  console.log("Supabase URL:", url);
  
  const supabase = createClient(url, key);
  
  async function run() {
    const { data: users, error } = await supabase
      .from("users")
      .select("*");
      
    if (error) {
      console.error("Error:", error);
    } else {
      console.log("Users in Database:");
      users.forEach(u => {
        console.log(`- Email: ${u.email}`);
        console.log(`  firstName: ${u.firstName}, lastName: ${u.lastName}`);
        console.log(`  phone: ${u.phone}`);
        console.log(`  country: ${u.country}, state: ${u.state}, location: ${u.location}`);
        console.log(`  has_updated_profile: ${u.has_updated_profile}`);
        console.log(`  monetized: ${u.monetized}`);
        console.log(`-----------------------------------`);
      });
    }
  }
  
  run();
} else {
  console.log(".env not found");
}
