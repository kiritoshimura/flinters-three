import { Inter } from "next/font/google";
import { THREEText } from "@/components/THREEText";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <>
      <THREEText answer="FLINTERS" />
    </>
  );
}
