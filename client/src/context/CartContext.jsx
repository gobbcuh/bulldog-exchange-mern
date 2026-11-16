
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const CartContext = createContext(null);

const STORAGE_KEY = "bulldog-exchange-cart";

function loadCart() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item) =>
        item &&
        typeof item.productId === "string" &&
        typeof item.cartKey === "string" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(loadCart);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(cart)
      );
    } catch (error) {
      console.error("Could not save cart:", error);
    }
  }, [cart]);

  function addToCart(product, quantity, size = "") {
    if (
      !product?.id ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return {
        success: false,
        message: "Invalid product or quantity.",
      };
    }

    const stock = Number(product.stock);

    if (!Number.isInteger(stock) || stock <= 0) {
      return {
        success: false,
        message: "This product is out of stock.",
      };
    }

    const existingQuantity = cart
      .filter((item) => item.productId === product.id)
      .reduce((total, item) => total + item.quantity, 0);

    const availableQuantity = Math.max(
      0,
      stock - existingQuantity
    );

    if (availableQuantity <= 0) {
      return {
        success: false,
        message: "You already have all available stock in your cart.",
      };
    }

    if (quantity > availableQuantity) {
      return {
        success: false,
        message: `Only ${availableQuantity} more item(s) can be added.`,
      };
    }

    const cartKey = `${product.id}:${size}`;

    setCart((current) => {
      const existing = current.find(
        (item) => item.cartKey === cartKey
      );

      if (existing) {
        return current.map((item) =>
          item.cartKey === cartKey
            ? {
                ...item,
                quantity: item.quantity + quantity,
              }
            : item
        );
      }

      return [
        ...current,
        {
          cartKey,
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          size,
          quantity,
        },
      ];
    });

    return {
      success: true,
      message: `${quantity} item(s) added to your cart.`,
    };
  }

  
  function updateQuantity(cartKey, newQuantity, stock) {
    if (!Number.isInteger(newQuantity)) {
      return {
        success: false,
        message: "Invalid quantity.",
      };
    }
  
    const existing = cart.find(
      (item) => item.cartKey === cartKey
    );
  
    if (!existing) {
      return {
        success: false,
        message: "Item not found in cart.",
      };
    }
  
    if (newQuantity <= 0) {
      removeFromCart(cartKey);
  
      return { success: true };
    }
  
    const otherQuantity = cart
      .filter(
        (item) =>
          item.productId === existing.productId &&
          item.cartKey !== cartKey
      )
      .reduce(
        (total, item) => total + item.quantity,
        0
      );
  
    const availableStock = Number(stock);
  
    if (
      !Number.isInteger(availableStock) ||
      newQuantity + otherQuantity > availableStock
    ) {
      return {
        success: false,
        message: "Not enough stock available.",
      };
    }
  
    setCart((current) =>
      current.map((item) =>
        item.cartKey === cartKey
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  
    return { success: true };
  }

  function removeFromCart(cartKey) {
    setCart((current) =>
      current.filter((item) => item.cartKey !== cartKey)
    );
  }

  function clearCart() {
    setCart([]);
  }

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const cartTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
    value={{
        cart,
        cartCount,
        cartTotal,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// This module intentionally exports both the provider and its hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error(
      "useCart must be used inside CartProvider"
    );
  }

  return context;
}
