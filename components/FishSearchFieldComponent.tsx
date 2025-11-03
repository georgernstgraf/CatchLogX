"use client";

import React, { useState, useRef } from "react";

// Fish interface für die API-Daten
interface Fish {
  id: number;
  speciesName: string;
  germanName: string;
  latinName: string;
  family: string;
}

const FishSearchFieldComponent = () => {
  const [searchInput, setSearchInput] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Fish[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function clearInputField() {
    setSearchInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
  }

  async function performSearch(searchTerm: string) {
    if (searchTerm.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      try {
        const response = await fetch(`/api/search/fish?q=${searchTerm}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions);
          setShowSuggestions(true);
        }
      } catch {
        alert("API nicht verfügbar");
      }
    } catch (error) {
      console.error("Sucherror:", error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearchInput(value);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }

  function selectSuggestion(suggestion: Fish) {
    setSearchInput(suggestion.germanName || suggestion.speciesName);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  return (
    <div className="relative">
      <div className="absolute left-3 top-11 transform -translate-y-1/2 text-gray-400">
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        onChange={handleInputChange}
        value={searchInput}
        type="text"
        name="fischi"
        id="fischi"
        placeholder="z.B. Forelle ..."
        className="border-[0.25px] focus:border-blue-600 w-102 pl-10 pr-10 py-2 mt-6 shadow-lg rounded-4xl outline-none"
      />
      <div
        onClick={clearInputField}
        className="absolute right-3 top-11 transform -translate-y-1/2 text-gray-400 cursor-pointer"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>

      {/* Vorschläge */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.id || index}
              onClick={() => selectSuggestion(suggestion)}
              className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 first:rounded-t-2xl last:rounded-b-2xl"
            >
              <div className="flex items-center">
                <svg
                  className="w-4 h-4 text-gray-400 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <div className="flex flex-col">
                  <span className="text-gray-800 font-medium">
                    ID: {suggestion.id}
                  </span>
                  <span className="text-gray-800 font-medium">
                    {suggestion.germanName || suggestion.speciesName}
                  </span>
                  {suggestion.latinName && (
                    <span className="text-gray-500 text-sm italic">
                      {suggestion.latinName}
                    </span>
                  )}
                  {suggestion.family && (
                    <span className="text-gray-400 text-xs">
                      Familie: {suggestion.family}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FishSearchFieldComponent;
