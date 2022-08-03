// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract OperatorRole is OwnableUpgradeable {
    mapping(address => bool) private _operators;

    event OperatorAdded(address indexed newOperator);
    event OperatorRemoved(address indexed operator);

    modifier onlyOperator() {
        require(
            _operators[_msgSender()],
            "OperatorRole: caller is not the operator"
        );
        _;
    }

    function __OperatorRole_init(address initialOperator)
        internal
        onlyInitializing
    {
        __Ownable_init();

        _operators[initialOperator] = true;
        emit OperatorAdded(initialOperator);
    }

    function addOperator(address operator) external onlyOwner {
        _operators[operator] = true;
        emit OperatorAdded(operator);
    }

    function removeOperator(address operator) external onlyOwner {
        _operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    uint256[50] private __gap;
}
