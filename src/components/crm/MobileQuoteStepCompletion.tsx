"use client";
import { createContext, useContext } from "react";
export const MobileQuoteStepCompletion = createContext<(() => void) | null>(null);
export const useMobileQuoteStepCompletion = () => useContext(MobileQuoteStepCompletion);
