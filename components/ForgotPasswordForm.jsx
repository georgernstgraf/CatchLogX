"use client"

import Image from 'next/image'
import Link from 'next/link'
import React from 'react'
import bokuLogo from "@/components/assets/img/Logo.png"

const ForgotPasswordForm = () => {

  const [username, setUsername] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          timestamp: Date.now(),
        }),
    })
    const data = await response.json();
    console.log(data);
  }

  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-[#f5f4f2]">
      <div className="bg-[#FCFBF9] rounded-xl shadow-lg flex flex-col items-center p-10 w-[400px]">
        <div className="flex flex-row items-center gap-9 w-full mb-6">
          <div className="flex items-center h-full">
            <Image src={bokuLogo} alt="Boku Logo" width={150} height={150} className="object-contain" />
          </div>
          <span className="text-black text-[25px] font-medium leading-tight">Universität für<br />Bodenkultur Wien</span>
        </div>
        <div className="text-black text-5xl font-bold mb-8 text-center w-full">Passwort zurücksetzen</div>
        <form onSubmit={handleSubmit} className="w-full">
          <input
            type="text"
            id="username"
            name="username"
            placeholder="Benutzername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full bg-white text-black border border-[#e5e5e5] p-4 rounded-lg mb-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#357174]"
          />
          <button type="submit" onClick={handleSubmit} className="w-full bg-[#357174] text-white p-4 rounded-lg text-lg font-medium  hover:bg-[#4da1a6] transition-colors duration-200 mb-4">Anfrage senden</button>
        </form>
      </div>
    </div>
  )
}

export default ForgotPasswordForm