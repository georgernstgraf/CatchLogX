"use client"

import Link from 'next/link'
import React from 'react'
import bokuLogo from "@/components/assets/img/Logo.png"
import Image from 'next/image'

const LoginForm = () => {

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Username:', username);
    console.log('Password:', password);
  }

  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-[#f5f4f2]">
      <div className="bg-[#FCFBF9] rounded-xl shadow-lg flex flex-col items-center p-10 w-[400px]">
        <div className="flex flex-row items-center gap-10 w-full mb-6">
          <Image src={bokuLogo} alt="Boku Logo" width={100} height={100} className="object-contain" />
          <span className="text-black text-[25px] font-medium">Universität für<br />Bodenkultur Wien</span>
        </div>
        <div className="text-black text-5xl font-bold mb-8 text-center w-full">Login</div>
        <input
          type="text"
          id="username"
          name="username"
          placeholder="Benutzername"
          required
          className="w-full bg-white text-black border border-[#e5e5e5] p-4 rounded-lg mb-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
        />
        <input
          type="password"
          id="password"
          name="password"
          placeholder="Passwort"
          required
          className="w-full bg-white text-black border border-[#e5e5e5] p-4 rounded-lg mb-6 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
        />
        <button type="submit" className="w-full bg-[#357174] text-white p-4 rounded-lg text-lg font-medium  hover:bg-[#4da1a6] transition-colors duration-200 mb-4">Anmelden</button>
        <Link href="/forgot-password" className="text-black text-base font-normal w-full text-center mb-4">Passwort vergessen?</Link>
      </div>
    </div>
  )
}

export default LoginForm