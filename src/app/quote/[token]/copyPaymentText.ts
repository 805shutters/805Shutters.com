type CopyPaymentTextDependencies = {
  legacyCopy: (value: string) => boolean;
  writeText?: (value: string) => Promise<void>;
};

function browserCopyDependencies(): CopyPaymentTextDependencies {
  return {
    legacyCopy(value) {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      try {
        document.body.appendChild(field);
        field.select();
        field.setSelectionRange(0, value.length);
        return document.execCommand("copy");
      } catch {
        return false;
      } finally {
        field.remove();
      }
    },
    writeText: navigator.clipboard?.writeText
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : undefined,
  };
}

export async function copyPaymentText(
  value: string,
  dependencies: CopyPaymentTextDependencies = browserCopyDependencies(),
): Promise<boolean> {
  // Run the legacy copy while the original tap still owns user activation.
  // Mobile Safari can reject the async clipboard call after that activation is lost.
  const legacyCopied = dependencies.legacyCopy(value);
  if (!dependencies.writeText) return legacyCopied;

  try {
    await dependencies.writeText(value);
    return true;
  } catch {
    return legacyCopied;
  }
}
