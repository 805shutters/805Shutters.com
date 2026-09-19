import {expect,it} from 'vitest';
import {allocateReceivedMoney} from './payment-allocation';
import {quotePaymentState} from './quote-payment-state';
it('credits Benson deposit top-up regardless of Balance label',()=>{
 expect(allocateReceivedMoney(3478.52+.88,3479.40)).toEqual({depositPaid:3479.40,balancePaid:0,paidTotal:3479.40});
 expect(quotePaymentState({total:6958.80,depositRequired:3479.40,payments:[{amount:3478.52,payment_label:'Deposit'},{amount:.88,payment_label:'Balance'}]})).toMatchObject({depositPaid:3479.40,dueType:'balance',amountDue:3479.40});
});
it('counts generic Square, full, and progress receipts toward the deposit',()=>{
 expect(quotePaymentState({total:6928,depositRequired:3464,payments:[{amount:3464,payment_label:'Square payment'}]})).toMatchObject({depositPaid:3464,dueType:'balance',amountDue:3464});
 expect(allocateReceivedMoney(750,500)).toEqual({depositPaid:500,balancePaid:250,paidTotal:750});
 expect(allocateReceivedMoney(1000,500)).toEqual({depositPaid:500,balancePaid:500,paidTotal:1000});
});
it('retains exact money through zero deposit, overpayment and reversal',()=>{
 expect(allocateReceivedMoney(500,0)).toEqual({depositPaid:0,balancePaid:500,paidTotal:500});
 expect(allocateReceivedMoney(1200,500)).toEqual({depositPaid:500,balancePaid:700,paidTotal:1200});
 expect(allocateReceivedMoney(-100,500)).toEqual({depositPaid:0,balancePaid:-100,paidTotal:-100});
});
